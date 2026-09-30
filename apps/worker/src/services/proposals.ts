// 提案服务（02-data-model#提案、03-api#提案）：
// agent 提交（草稿走同一套校验与密钥扫描）；owner 接受/拒绝/批量；
// 接受时按正常写入规则落库，修订的 actor 记为 “owner (proposal <id>)”。
import {
  entryDraftSchema,
  scanEntry,
  ulid,
  slugify,
  snippetId,
  type Entry,
  type EntryDraft,
} from '@aikit/shared';
import { rowToEntry, type EntryRow } from '../db/mappers';
import { changeLogStmt } from '../db/helpers';
import {
  AppError,
  badRequest,
  notFound,
  slugTaken,
  validationFailed,
  secretDetected as secretDetectedError,
  versionConflict,
} from '../errors';

export interface ProposalRow {
  id: string;
  source: string;
  actor: string;
  kind: string;
  target_entry_id: string | null;
  base_version: number | null;
  payload: string;
  reason: string;
  status: string;
  created_at: string;
  decided_at: string | null;
  decided_by: string | null;
}

const SELECT_PROPOSAL = `SELECT id, source, actor, kind, target_entry_id, base_version, payload, reason, status, created_at, decided_at, decided_by FROM proposals`;

export function rowToProposal(row: ProposalRow) {
  return {
    id: row.id,
    source: row.source,
    actor: row.actor,
    kind: row.kind as 'create' | 'update' | 'archive' | 'merge',
    targetEntryId: row.target_entry_id,
    baseVersion: row.base_version,
    payload: JSON.parse(row.payload) as unknown,
    reason: row.reason,
    status: row.status as 'pending' | 'accepted' | 'rejected' | 'superseded',
    createdAt: row.created_at,
    decidedAt: row.decided_at,
    decidedBy: row.decided_by,
  };
}

export async function listProposals(db: D1Database, status?: string): Promise<unknown[]> {
  const filter = status ? 'WHERE status = ?' : '';
  const { results } = await db
    .prepare(`${SELECT_PROPOSAL} ${filter} ORDER BY created_at DESC`)
    .bind(...(status ? [status] : []))
    .all<ProposalRow>();
  return results.map(rowToProposal);
}

/** 校验提案草稿（与正常写入同一套规则）。 */
function validateDraft(payload: unknown): EntryDraft {
  const parsed = entryDraftSchema.safeParse(payload);
  if (!parsed.success)
    throw validationFailed(
      '提案草稿没有通过校验。',
      parsed.error.issues.map((i) => ({
        path: i.path.join('.'),
        issue: i.code,
        message: i.message,
      })),
    );
  const findings = scanEntry(parsed.data);
  if (findings.length) throw secretDetectedError(findings);
  return parsed.data;
}

/** agent 提交提案（POST /api/proposals，03-api）。 */
export async function createProposal(
  db: D1Database,
  payload: unknown,
  actor: string,
): Promise<unknown> {
  const body = payload as {
    kind?: string;
    targetId?: string;
    baseVersion?: number;
    draft?: unknown;
    mergeIds?: string[];
    reason?: string;
  };
  const kind = body.kind;
  if (kind !== 'create' && kind !== 'update' && kind !== 'archive' && kind !== 'merge')
    throw badRequest('kind 需要是 create、update、archive 或 merge。');

  const draft = kind === 'merge' ? undefined : validateDraft(body.draft);
  if (kind === 'merge' && (!Array.isArray(body.mergeIds) || body.mergeIds.length < 1))
    throw badRequest('合并提案需要 mergeIds。');
  if ((kind === 'update' || kind === 'archive') && !body.targetId)
    throw badRequest('update/archive 提案需要 targetId。');

  const now = new Date().toISOString();
  const id = ulid();
  // payload 存放完整草稿（merge 时含 mergeIds）
  const stored = JSON.stringify({
    draft: draft ?? null,
    mergeIds: body.mergeIds ?? null,
  });
  await db
    .prepare(
      `INSERT INTO proposals (id, source, actor, kind, target_entry_id, base_version, payload, reason, status, created_at)
       VALUES (?, 'agent', ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    )
    .bind(
      id,
      actor,
      kind,
      body.targetId ?? null,
      body.baseVersion ?? null,
      stored,
      (body.reason ?? '').slice(0, 1000),
      now,
    )
    .run();
  await changeLogStmt(db, 'proposal', id, 'upsert', now).run();
  return { id, status: 'pending' };
}

async function getProposalRow(db: D1Database, id: string): Promise<ProposalRow | null> {
  return db.prepare(`${SELECT_PROPOSAL} WHERE id = ?`).bind(id).first<ProposalRow>();
}

/** 校验提案针对的条目仍在 baseVersion；不符返回冲突。 */
async function ensureBaseVersion(db: D1Database, p: ProposalRow): Promise<EntryRow> {
  const row = await db
    .prepare(
      `SELECT id, type, slug, title, summary, status, pinned, rating, platforms, tags, fields,
              snippets, links, body, version, created_at, updated_at, deleted_at
       FROM entries WHERE id = ? AND deleted_at IS NULL`,
    )
    .bind(p.target_entry_id ?? '')
    .first<EntryRow>();
  if (!row) throw notFound('提案指向的条目不存在或已删除。');
  if (p.base_version != null && row.version !== p.base_version)
    throw versionConflict(rowToEntry(row));
  return row;
}

/** 接受提案：按正常写入规则落库；修订 actor 记为 “owner (proposal <id>)”（03-api）。 */
export async function acceptProposal(
  db: D1Database,
  id: string,
  actor: string,
  payloadOverride?: unknown,
): Promise<unknown> {
  const p = await getProposalRow(db, id);
  if (!p) throw notFound('提案不存在。');
  if (p.status !== 'pending')
    throw new AppError('bad_request', 400, `这个提案已经处理过了（${p.status}）。`);

  const stored = JSON.parse(p.payload) as { draft?: unknown; mergeIds?: string[] };
  const now = new Date().toISOString();
  const revActor = `${actor} (proposal ${id})`;

  let result: unknown;

  if (p.kind === 'create') {
    const draft = validateDraft(payloadOverride ?? stored.draft);
    const slug = draft.slug ?? slugify(draft.title);
    if (await slugTakenBy(db, draft.type, slug)) throw slugTaken(slug);
    const entryId = ulid();
    await db
      .prepare(
        `INSERT INTO entries (id, type, slug, title, summary, status, pinned, rating, platforms, tags, fields, snippets, links, body, version, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL)`,
      )
      .bind(
        entryId,
        draft.type,
        slug,
        draft.title,
        draft.summary,
        draft.status,
        draft.pinned ? 1 : 0,
        draft.rating,
        JSON.stringify(draft.platforms),
        JSON.stringify(draft.tags),
        JSON.stringify(draft.fields),
        JSON.stringify(draft.snippets.map((s) => ({ ...s, id: s.id ?? snippetId() }))),
        JSON.stringify(draft.links),
        draft.body,
        now,
        now,
      )
      .run();
    await changeLogStmt(db, 'entry', entryId, 'upsert', now).run();
    result = { entryId };
  } else if (p.kind === 'update') {
    const current = await ensureBaseVersion(db, p);
    const draft = validateDraft(payloadOverride ?? stored.draft);
    const slug = draft.slug ?? slugify(draft.title);
    if (slug !== current.slug && (await slugTakenBy(db, draft.type, slug, current.id)))
      throw slugTaken(slug);
    const updated: Entry = {
      ...rowToEntry(current),
      ...draft,
      slug,
      snippets: draft.snippets.map((s) => ({ ...s, id: s.id ?? snippetId() })),
      version: current.version + 1,
      updatedAt: now,
    };
    await db.batch([
      db
        .prepare(
          `INSERT INTO revisions (entry_id, version, snapshot, actor, created_at) VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(current.id, current.version, JSON.stringify(rowToEntry(current)), revActor, now),
      db
        .prepare(
          `UPDATE entries SET type = ?, slug = ?, title = ?, summary = ?, status = ?, pinned = ?, rating = ?,
               platforms = ?, tags = ?, fields = ?, snippets = ?, links = ?, body = ?, version = ?, updated_at = ?
             WHERE id = ?`,
        )
        .bind(
          updated.type,
          updated.slug,
          updated.title,
          updated.summary,
          updated.status,
          updated.pinned ? 1 : 0,
          updated.rating,
          JSON.stringify(updated.platforms),
          JSON.stringify(updated.tags),
          JSON.stringify(updated.fields),
          JSON.stringify(updated.snippets),
          JSON.stringify(updated.links),
          updated.body,
          updated.version,
          updated.updatedAt,
          current.id,
        ),
      changeLogStmt(db, 'entry', current.id, 'upsert', now),
    ]);
    result = { entryId: current.id, version: updated.version };
  } else if (p.kind === 'archive') {
    const current = await ensureBaseVersion(db, p);
    const updated: Entry = {
      ...rowToEntry(current),
      status: 'archived',
      version: current.version + 1,
      updatedAt: now,
    };
    await db.batch([
      db
        .prepare(
          `INSERT INTO revisions (entry_id, version, snapshot, actor, created_at) VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(current.id, current.version, JSON.stringify(rowToEntry(current)), revActor, now),
      db
        .prepare(`UPDATE entries SET status = 'archived', version = ?, updated_at = ? WHERE id = ?`)
        .bind(updated.version, now, current.id),
      changeLogStmt(db, 'entry', current.id, 'upsert', now),
    ]);
    result = { entryId: current.id, version: updated.version };
  } else {
    // merge：把 mergeIds 的信息并进目标条目（说明、标签、片段去重合并），其余条目标记已弃用
    const current = await ensureBaseVersion(db, p);
    const merged = await mergeEntries(db, current, stored.mergeIds ?? [], revActor, now);
    result = { entryId: current.id, version: merged.version };
  }

  await db
    .prepare(
      `UPDATE proposals SET status = 'accepted', decided_at = ?, decided_by = ? WHERE id = ?`,
    )
    .bind(now, actor, id)
    .run();
  await changeLogStmt(db, 'proposal', id, 'upsert', now).run();
  return result;
}

/** 合并：目标条目并入各来源的信息；来源条目标记已弃用（各生成修订与变更日志）。 */
async function mergeEntries(
  db: D1Database,
  target: EntryRow,
  mergeIds: string[],
  revActor: string,
  now: string,
): Promise<Entry> {
  const sources: Entry[] = [];
  for (const id of mergeIds) {
    const row = await db
      .prepare(
        `SELECT id, type, slug, title, summary, status, pinned, rating, platforms, tags, fields,
                snippets, links, body, version, created_at, updated_at, deleted_at
         FROM entries WHERE id = ? AND deleted_at IS NULL`,
      )
      .bind(id)
      .first<EntryRow>();
    if (row) sources.push(rowToEntry(row));
  }
  if (!sources.length) throw badRequest('要合并的条目都不存在。');

  const targetEntry = rowToEntry(target);
  const merged: Entry = {
    ...targetEntry,
    summary: targetEntry.summary || sources.find((s) => s.summary)?.summary || '',
    tags: Array.from(new Set([...targetEntry.tags, ...sources.flatMap((s) => s.tags)])),
    platforms: Array.from(
      new Set([...targetEntry.platforms, ...sources.flatMap((s) => s.platforms)]),
    ),
    fields: {
      ...Object.fromEntries(sources.flatMap((s) => Object.entries(s.fields))),
      ...targetEntry.fields,
    },
    links: [
      ...targetEntry.links,
      ...sources
        .flatMap((s) => s.links)
        .filter((l) => !targetEntry.links.some((t) => t.url === l.url)),
    ],
    body: [targetEntry.body, ...sources.map((s) => `## 合并自 ${s.title}\n\n${s.body}`.trim())]
      .filter(Boolean)
      .join('\n\n'),
    version: target.version + 1,
    updatedAt: now,
  };

  const stmts = [
    db
      .prepare(
        `INSERT INTO revisions (entry_id, version, snapshot, actor, created_at) VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(target.id, target.version, JSON.stringify(targetEntry), revActor, now),
    db
      .prepare(
        `UPDATE entries SET summary = ?, tags = ?, platforms = ?, fields = ?, links = ?, body = ?, version = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(
        merged.summary,
        JSON.stringify(merged.tags),
        JSON.stringify(merged.platforms),
        JSON.stringify(merged.fields),
        JSON.stringify(merged.links),
        merged.body,
        merged.version,
        now,
        target.id,
      ),
    changeLogStmt(db, 'entry', target.id, 'upsert', now),
  ];
  for (const s of sources) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO revisions (entry_id, version, snapshot, actor, created_at) VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(s.id, s.version, JSON.stringify(s), revActor, now),
      db
        .prepare(`UPDATE entries SET status = 'archived', version = ?, updated_at = ? WHERE id = ?`)
        .bind(s.version + 1, now, s.id),
      changeLogStmt(db, 'entry', s.id, 'upsert', now),
    );
  }
  await db.batch(stmts);
  return merged;
}

/** 拒绝提案（可带原因）。 */
export async function rejectProposal(
  db: D1Database,
  id: string,
  reason: string | undefined,
  actor: string,
): Promise<void> {
  const p = await getProposalRow(db, id);
  if (!p) throw notFound('提案不存在。');
  if (p.status !== 'pending')
    throw new AppError('bad_request', 400, `这个提案已经处理过了（${p.status}）。`);
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE proposals SET status = 'rejected', decided_at = ?, decided_by = ? WHERE id = ?`,
    )
    .bind(now, actor, id)
    .run();
  await changeLogStmt(db, 'proposal', id, 'upsert', now).run();
  if (reason) {
    await db
      .prepare(`UPDATE proposals SET reason = ? WHERE id = ?`)
      .bind(`${p.reason}\n拒绝理由：${reason}`.slice(0, 1000), id)
      .run();
  }
}

export interface BulkResultItem {
  id: string;
  ok: boolean;
  error?: { code: string; message: string };
}

/** 批量处理（03-api POST /api/proposals/bulk）：逐条返回结果，一条失败不影响其他。 */
export async function bulkProposals(
  db: D1Database,
  ids: string[],
  action: 'accept' | 'reject',
  actor: string,
): Promise<{ results: BulkResultItem[] }> {
  const results: BulkResultItem[] = [];
  for (const id of ids) {
    try {
      if (action === 'accept') await acceptProposal(db, id, actor);
      else await rejectProposal(db, id, undefined, actor);
      results.push({ id, ok: true });
    } catch (err) {
      const e = err as AppError;
      results.push({ id, ok: false, error: { code: e.code ?? 'error', message: e.message } });
    }
  }
  return { results };
}

async function slugTakenBy(
  db: D1Database,
  type: string,
  slug: string,
  selfId?: string,
): Promise<boolean> {
  const row =
    selfId == null
      ? await db
          .prepare(`SELECT 1 FROM entries WHERE type = ? AND slug = ? AND deleted_at IS NULL`)
          .bind(type, slug)
          .first()
      : await db
          .prepare(
            `SELECT 1 FROM entries WHERE type = ? AND slug = ? AND deleted_at IS NULL AND id != ?`,
          )
          .bind(type, slug, selfId)
          .first();
  return row != null;
}
