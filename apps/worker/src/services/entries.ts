// 条目服务：写入规则（02-data-model#写入规则）是这里的核心：
// 1) Zod 校验 + 密钥扫描 → 2) If-Match 比对 → 3) 写修订 → 4) 写实体 version+1 → 5) 追加 change_log。
// 全部在一个 D1 batch 里（D1 batch 按事务执行）。
import {
  entryDraftSchema,
  entryPatchSchema,
  scanEntry,
  ulid,
  snippetId,
  slugify,
  type Entry,
  type EntryDraft,
} from '@aikit/shared';
import { rowToEntry, type EntryRow } from '../db/mappers';
import { loadStackRefs, changeLogStmt } from '../db/helpers';
import {
  AppError,
  notFound,
  preconditionRequired,
  slugTaken,
  validationFailed,
  versionConflict,
  secretDetected as secretDetectedError,
} from '../errors';

const SELECT_ENTRY = `
  SELECT id, type, slug, title, summary, status, pinned, rating, platforms, tags, fields,
         snippets, links, body, version, created_at, updated_at, deleted_at
  FROM entries`;

async function getEntryRow(db: D1Database, id: string): Promise<EntryRow | null> {
  return db
    .prepare(`${SELECT_ENTRY} WHERE id = ? AND deleted_at IS NULL`)
    .bind(id)
    .first<EntryRow>();
}

/** 读取单条（含 stacks 组装）。不存在或已删除 → null。 */
export async function getEntry(db: D1Database, id: string): Promise<Entry | null> {
  const row = await getEntryRow(db, id);
  if (!row) return null;
  const refs = await loadStackRefs(db, [id]);
  return rowToEntry(row, refs.get(id) ?? []);
}

/** 列表查询：过滤条件来自 03-api GET /api/entries。 */
export async function listEntries(
  db: D1Database,
  filters: { type?: string; status?: string; stack?: string; q?: string },
  limit = 500,
): Promise<Entry[]> {
  const conditions = ['deleted_at IS NULL'];
  const params: unknown[] = [];
  if (filters.type) {
    conditions.push('type = ?');
    params.push(filters.type);
  }
  if (filters.status) {
    conditions.push('status = ?');
    params.push(filters.status);
  }
  if (filters.stack) {
    conditions.push('id IN (SELECT entry_id FROM stack_entries WHERE stack_id = ?)');
    params.push(filters.stack);
  }
  const { results } = await db
    .prepare(`${SELECT_ENTRY} WHERE ${conditions.join(' AND ')} ORDER BY updated_at DESC LIMIT ?`)
    .bind(...params, Math.min(limit, 500))
    .all<EntryRow>();
  const refs = await loadStackRefs(
    db,
    results.map((r) => r.id),
  );
  return results.map((r) => rowToEntry(r, refs.get(r.id) ?? []));
}

/** 服务端统一校验：Zod → 错误 details；密钥扫描 → 422 secret_detected。 */
function validateDraft(payload: unknown): EntryDraft {
  const parsed = entryDraftSchema.safeParse(payload);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => ({
      path: i.path.join('.'),
      issue: i.code,
      message: i.message,
    }));
    throw validationFailed('内容没有通过校验，请检查下面列出的字段。', details);
  }
  const findings = scanEntry(parsed.data);
  if (findings.length) throw secretDetectedError(findings);
  return parsed.data;
}

/** If-Match 解析：返回期望版本号；缺头 → 428。 */
export function parseIfMatch(header: string | undefined): number {
  if (header == null) throw preconditionRequired();
  const m = /^"?(\d+)"?$/.exec(header.trim());
  if (!m) throw new AppError('bad_request', 400, 'If-Match 需要是带引号的版本号，如 "3"');
  return Number(m[1]);
}

/** 同类型下 slug 唯一（不含已删除）；冲突返回 true。 */
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

/** 从草稿构造完整条目（补 id/slug/片段 id/时间/version）。 */
function draftToEntry(
  draft: EntryDraft,
  opts: { id?: string; slug?: string; createdAt: string; now: string },
): Entry {
  return {
    id: opts.id ?? ulid(),
    type: draft.type,
    slug: opts.slug ?? draft.slug ?? '',
    title: draft.title,
    summary: draft.summary,
    status: draft.status,
    pinned: draft.pinned,
    rating: draft.rating,
    platforms: draft.platforms,
    tags: draft.tags,
    fields: draft.fields,
    snippets: draft.snippets.map((s) => ({ ...s, id: s.id ?? snippetId() })),
    links: draft.links,
    body: draft.body,
    stacks: [],
    version: 1,
    createdAt: opts.createdAt,
    updatedAt: opts.now,
    deletedAt: null,
  };
}

async function ensureTypeExists(db: D1Database, typeId: string) {
  const row = await db.prepare('SELECT 1 FROM types WHERE id = ?').bind(typeId).first();
  if (!row)
    throw validationFailed('所选类型不存在，请先在设置里创建。', [
      { path: 'type', issue: 'invalid', message: `类型 ${typeId} 不存在` },
    ]);
}

async function ensurePlatformsExist(db: D1Database, ids: string[]) {
  if (!ids.length) return;
  const { results } = await db
    .prepare(`SELECT id FROM platforms WHERE id IN (${ids.map(() => '?').join(',')})`)
    .bind(...ids)
    .all<{ id: string }>();
  const found = new Set(results.map((r) => r.id));
  const missing = ids.filter((i) => !found.has(i));
  if (missing.length)
    throw validationFailed('有些平台不存在，请先在设置里创建。', [
      { path: 'platforms', issue: 'invalid', message: `不存在的平台：${missing.join('、')}` },
    ]);
}

export interface WriteResult {
  entry: Entry;
}

/** 新建条目（03-api POST /api/entries；id 可由客户端带，幂等键由路由层处理）。 */
export async function createEntry(
  db: D1Database,
  payload: unknown,
  opts: { id?: string; idempotencyKey?: string },
): Promise<Entry> {
  const draft = validateDraft(payload);
  await ensureTypeExists(db, draft.type);
  await ensurePlatformsExist(db, draft.platforms);

  const now = new Date().toISOString();
  const slug = draft.slug ?? slugify(draft.title);
  if (await slugTakenBy(db, draft.type, slug)) throw slugTaken(slug);

  const entry = draftToEntry(draft, { id: opts.id, slug, createdAt: now, now });

  await db
    .prepare(
      `INSERT INTO entries (id, type, slug, title, summary, status, pinned, rating, platforms, tags, fields, snippets, links, body, version, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    )
    .bind(
      entry.id,
      entry.type,
      entry.slug,
      entry.title,
      entry.summary,
      entry.status,
      entry.pinned ? 1 : 0,
      entry.rating,
      JSON.stringify(entry.platforms),
      JSON.stringify(entry.tags),
      JSON.stringify(entry.fields),
      JSON.stringify(entry.snippets),
      JSON.stringify(entry.links),
      entry.body,
      entry.version,
      entry.createdAt,
      entry.updatedAt,
    )
    .run();
  await changeLogStmt(db, 'entry', entry.id, 'upsert', now).run();
  return entry;
}

/** 更新条目（整条替换，需 If-Match）。写修订 → 写实体 → change_log，一个 batch。 */
export async function updateEntry(
  db: D1Database,
  id: string,
  ifMatch: string | undefined,
  payload: unknown,
  actor: string,
): Promise<Entry> {
  const draft = validateDraft(payload);
  const expected = parseIfMatch(ifMatch);
  const current = await getEntryRow(db, id);
  if (!current) throw notFound('条目不存在或已删除');

  await ensureTypeExists(db, draft.type);
  await ensurePlatformsExist(db, draft.platforms);

  const slug = draft.slug ?? slugify(draft.title);
  if (slug !== current.slug && (await slugTakenBy(db, draft.type, slug, id))) throw slugTaken(slug);

  if (current.version !== expected) {
    throw versionConflict(rowToEntry(current));
  }

  const now = new Date().toISOString();
  const updated: Entry = {
    ...rowToEntry(current),
    ...draft,
    slug,
    snippets: draft.snippets.map((s) => ({ ...s, id: s.id ?? snippetId() })),
    stacks: rowToEntry(current).stacks,
    version: current.version + 1,
    updatedAt: now,
  };

  // 一个 batch：修订（写入前快照）+ 实体 + 变更日志
  await db.batch([
    db
      .prepare(
        `INSERT INTO revisions (entry_id, version, snapshot, actor, created_at) VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(id, current.version, JSON.stringify(rowToEntry(current)), actor, now),
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
        id,
      ),
    changeLogStmt(db, 'entry', id, 'upsert', now),
  ]);
  return updated;
}

/** 快捷修改（只改 status/pinned/rating，需 If-Match）。 */
export async function patchEntry(
  db: D1Database,
  id: string,
  ifMatch: string | undefined,
  payload: unknown,
  actor: string,
): Promise<Entry> {
  const parsed = entryPatchSchema.safeParse(payload);
  if (!parsed.success)
    throw validationFailed(
      '只能修改状态、置顶或评分。',
      parsed.error.issues.map((i) => ({
        path: i.path.join('.'),
        issue: i.code,
        message: i.message,
      })),
    );
  const expected = parseIfMatch(ifMatch);
  const current = await getEntryRow(db, id);
  if (!current) throw notFound('条目不存在或已删除');
  if (current.version !== expected) throw versionConflict(rowToEntry(current));

  const now = new Date().toISOString();
  const current2 = rowToEntry(current);
  const updated: Entry = {
    ...current2,
    ...parsed.data,
    version: current.version + 1,
    updatedAt: now,
  };

  await db.batch([
    db
      .prepare(
        `INSERT INTO revisions (entry_id, version, snapshot, actor, created_at) VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(id, current.version, JSON.stringify(current2), actor, now),
    db
      .prepare(
        `UPDATE entries SET status = ?, pinned = ?, rating = ?, version = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(
        updated.status,
        updated.pinned ? 1 : 0,
        updated.rating,
        updated.version,
        updated.updatedAt,
        id,
      ),
    changeLogStmt(db, 'entry', id, 'upsert', now),
  ]);
  return updated;
}

/** 软删除：写 deleted_at、删 stack_entries、写修订、change_log；一个 batch。 */
export async function deleteEntry(
  db: D1Database,
  id: string,
  ifMatch: string | undefined,
  actor: string,
): Promise<void> {
  const expected = parseIfMatch(ifMatch);
  const current = await getEntryRow(db, id);
  if (!current) throw notFound('条目不存在或已删除');
  if (current.version !== expected) throw versionConflict(rowToEntry(current));

  const now = new Date().toISOString();
  const current2 = rowToEntry(current);
  await db.batch([
    db
      .prepare(
        `INSERT INTO revisions (entry_id, version, snapshot, actor, created_at) VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(id, current.version, JSON.stringify(current2), actor, now),
    db
      .prepare(`UPDATE entries SET deleted_at = ?, version = ?, updated_at = ? WHERE id = ?`)
      .bind(now, current.version + 1, now, id),
    db.prepare(`DELETE FROM stack_entries WHERE entry_id = ?`).bind(id),
    changeLogStmt(db, 'entry', id, 'delete', now),
  ]);
}

/** 修订列表：version、actor、createdAt（03-api）。 */
export async function listRevisions(db: D1Database, id: string) {
  const entry = await getEntryRow(db, id);
  if (!entry) throw notFound('条目不存在或已删除');
  const { results } = await db
    .prepare(
      `SELECT version, actor, created_at FROM revisions WHERE entry_id = ? ORDER BY version DESC`,
    )
    .bind(id)
    .all<{ version: number; actor: string; created_at: string }>();
  return results.map((r) => ({ version: r.version, actor: r.actor, createdAt: r.created_at }));
}

/** 某个版本的完整快照。 */
export async function getRevision(db: D1Database, id: string, version: number): Promise<Entry> {
  const entry = await getEntryRow(db, id);
  if (!entry) throw notFound('条目不存在或已删除');
  const row = await db
    .prepare(`SELECT snapshot FROM revisions WHERE entry_id = ? AND version = ?`)
    .bind(id, version)
    .first<{ snapshot: string }>();
  if (!row) throw notFound('没有这个版本的修订');
  return JSON.parse(row.snapshot) as Entry;
}

/** 恢复：用快照生成新版本（需 If-Match）。 */
export async function restoreEntry(
  db: D1Database,
  id: string,
  ifMatch: string | undefined,
  version: number,
  actor: string,
): Promise<Entry> {
  const expected = parseIfMatch(ifMatch);
  const current = await getEntryRow(db, id);
  if (!current) throw notFound('条目不存在或已删除');
  if (current.version !== expected) throw versionConflict(rowToEntry(current));
  const snapshot = await getRevision(db, id, version);

  const now = new Date().toISOString();
  const current2 = rowToEntry(current);
  const restored: Entry = {
    ...snapshot,
    id,
    version: current.version + 1,
    updatedAt: now,
    deletedAt: null,
  };
  const row = restored;
  await db.batch([
    db
      .prepare(
        `INSERT INTO revisions (entry_id, version, snapshot, actor, created_at) VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(id, current.version, JSON.stringify(current2), actor, now),
    db
      .prepare(
        `UPDATE entries SET type = ?, slug = ?, title = ?, summary = ?, status = ?, pinned = ?, rating = ?,
             platforms = ?, tags = ?, fields = ?, snippets = ?, links = ?, body = ?, version = ?, updated_at = ?
           WHERE id = ?`,
      )
      .bind(
        row.type,
        row.slug,
        row.title,
        row.summary,
        row.status,
        row.pinned ? 1 : 0,
        row.rating,
        JSON.stringify(row.platforms),
        JSON.stringify(row.tags),
        JSON.stringify(row.fields),
        JSON.stringify(row.snippets),
        JSON.stringify(row.links),
        row.body,
        row.version,
        row.updatedAt,
        id,
      ),
    changeLogStmt(db, 'entry', id, 'upsert', now),
  ]);
  return restored;
}
