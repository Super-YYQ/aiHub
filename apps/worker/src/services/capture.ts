// 快速记录服务（03-api#快速记录）：captureToDraft 转换 + 落库 + 可选环境。
import {
  captureSchema,
  captureToDraft,
  scanEntry,
  ulid,
  snippetId,
  type Entry,
} from '@aikit/shared';
import { changeLogStmt } from '../db/helpers';
import { notFound, validationFailed, secretDetected as secretDetectedError } from '../errors';

export async function capture(db: D1Database, payload: unknown): Promise<Entry> {
  const parsed = captureSchema.safeParse(payload);
  if (!parsed.success)
    throw validationFailed(
      '快速记录没有通过校验。',
      parsed.error.issues.map((i) => ({
        path: i.path.join('.'),
        issue: i.code,
        message: i.message,
      })),
    );

  const draft = captureToDraft(parsed.data);
  const findings = scanEntry(draft);
  if (findings.length) throw secretDetectedError(findings);

  // slug 唯一：冲突加后缀
  let slug = draft.slug;
  for (let n = 2; ; n++) {
    const taken = await db
      .prepare(`SELECT 1 FROM entries WHERE type = ? AND slug = ? AND deleted_at IS NULL`)
      .bind(draft.type, slug)
      .first();
    if (!taken) break;
    slug = `${draft.slug}-${n}`;
  }

  const now = new Date().toISOString();
  const id = ulid();
  await db
    .prepare(
      `INSERT INTO entries (id, type, slug, title, summary, status, pinned, rating, platforms, tags, fields, snippets, links, body, version, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, 'inbox', 0, 0, '[]', '[]', '{}', ?, ?, ?, 1, ?, ?, NULL)`,
    )
    .bind(
      id,
      draft.type,
      slug,
      draft.title,
      draft.summary,
      JSON.stringify(draft.snippets.map((s) => ({ ...s, id: snippetId() }))),
      JSON.stringify(draft.links),
      draft.body,
      now,
      now,
    )
    .run();

  // 可选：加入环境
  if (parsed.data.stackId) {
    const stack = await db
      .prepare(`SELECT 1 FROM stacks WHERE id = ? AND deleted_at IS NULL`)
      .bind(parsed.data.stackId)
      .first();
    if (!stack) throw notFound('指定的环境不存在或已删除');
    await db
      .prepare(
        `INSERT OR IGNORE INTO stack_entries (stack_id, entry_id, note, added_at) VALUES (?, ?, '', ?)`,
      )
      .bind(parsed.data.stackId, id, now)
      .run();
  }

  await changeLogStmt(db, 'entry', id, 'upsert', now).run();
  return {
    id,
    type: draft.type,
    slug,
    title: draft.title,
    summary: draft.summary,
    status: 'inbox',
    pinned: false,
    rating: 0,
    platforms: [],
    tags: [],
    fields: {},
    snippets: draft.snippets.map((s) => ({ ...s, id: snippetId() })),
    links: draft.links,
    body: draft.body,
    stacks: parsed.data.stackId ? [{ id: parsed.data.stackId, note: '' }] : [],
    version: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}
