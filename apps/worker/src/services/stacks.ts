// 环境服务：环境的增删改查与成员关系（03-api#环境）。
// 成员关系变化也记为条目变更（条目的 stacks 变了），同步接口因此只需要推送条目。
import {
  stackWriteSchema,
  stackEntriesUpdateSchema,
  stackEntryNoteSchema,
  ulid,
  type Stack,
} from '@aikit/shared';
import { rowToStack } from '../db/mappers';
import { changeLogStmt, loadStackRefs } from '../db/helpers';
import { AppError, notFound, validationFailed, versionConflict } from '../errors';
import { parseIfMatch } from './entries';

const SELECT_STACK = `SELECT id, name, kind, os, description, sort, version, created_at, updated_at, deleted_at FROM stacks`;

type StackRow = {
  id: string;
  name: string;
  kind: string;
  os: string;
  description: string;
  sort: number;
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

function validateStack(payload: unknown) {
  const parsed = stackWriteSchema.safeParse(payload);
  if (!parsed.success)
    throw validationFailed('环境信息没有通过校验。', stackIssues(parsed.error.issues));
  return parsed.data;
}

function stackIssues(
  issues: Array<{ path: (string | number | symbol)[]; code: string; message: string }>,
) {
  return issues.map((i) => ({ path: i.path.join('.'), issue: i.code, message: i.message }));
}

async function getStackRow(db: D1Database, id: string): Promise<StackRow | null> {
  return db
    .prepare(`${SELECT_STACK} WHERE id = ? AND deleted_at IS NULL`)
    .bind(id)
    .first<StackRow>();
}

/** 全部环境（附 entryCount）。 */
export async function listStacks(db: D1Database): Promise<Array<Stack & { entryCount: number }>> {
  const { results } = await db
    .prepare(`${SELECT_STACK} WHERE deleted_at IS NULL ORDER BY sort, created_at`)
    .all<StackRow>();
  const counts = await db
    .prepare(
      `SELECT s.id AS stack_id, COUNT(se.entry_id) AS n FROM stacks s
       LEFT JOIN stack_entries se ON se.stack_id = s.id
       WHERE s.deleted_at IS NULL GROUP BY s.id`,
    )
    .all<{ stack_id: string; n: number }>();
  const countMap = new Map(counts.results.map((r) => [r.stack_id, r.n]));
  return results.map((r) => ({ ...rowToStack(r), entryCount: countMap.get(r.id) ?? 0 }));
}

export async function getStack(db: D1Database, id: string): Promise<Stack | null> {
  const row = await getStackRow(db, id);
  return row ? rowToStack(row) : null;
}

export async function createStack(db: D1Database, payload: unknown): Promise<Stack> {
  const data = validateStack(payload);
  const dup = await db
    .prepare(`SELECT 1 FROM stacks WHERE name = ? AND deleted_at IS NULL`)
    .bind(data.name)
    .first();
  if (dup) throw new AppError('slug_taken', 409, `环境名“${data.name}”已被占用`);
  const now = new Date().toISOString();
  const id = ulid();
  await db
    .prepare(
      `INSERT INTO stacks (id, name, kind, os, description, sort, version, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, NULL)`,
    )
    .bind(id, data.name, data.kind, data.os, data.description, data.sort, now, now)
    .run();
  await changeLogStmt(db, 'stack', id, 'upsert', now).run();
  return {
    id,
    name: data.name,
    kind: data.kind,
    os: data.os,
    description: data.description,
    sort: data.sort,
    version: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

export async function updateStack(
  db: D1Database,
  id: string,
  ifMatch: string | undefined,
  payload: unknown,
): Promise<Stack> {
  const data = validateStack(payload);
  const expected = parseIfMatch(ifMatch);
  const row = await getStackRow(db, id);
  if (!row) throw notFound('环境不存在或已删除');
  if (row.version !== expected) throw versionConflict(rowToStack(row));
  const dup = await db
    .prepare(`SELECT 1 FROM stacks WHERE name = ? AND deleted_at IS NULL AND id != ?`)
    .bind(data.name, id)
    .first();
  if (dup) throw new AppError('slug_taken', 409, `环境名“${data.name}”已被占用`);

  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE stacks SET name = ?, kind = ?, os = ?, description = ?, sort = ?, version = ?, updated_at = ? WHERE id = ?`,
    )
    .bind(data.name, data.kind, data.os, data.description, data.sort, row.version + 1, now, id)
    .run();
  await changeLogStmt(db, 'stack', id, 'upsert', now).run();
  return { ...rowToStack(row), ...data, version: row.version + 1, updatedAt: now };
}

/** 删除环境：只解除成员关系，不删条目（03-api）。 */
export async function deleteStack(db: D1Database, id: string, ifMatch: string | undefined) {
  const expected = parseIfMatch(ifMatch);
  const row = await getStackRow(db, id);
  if (!row) throw notFound('环境不存在或已删除');
  if (row.version !== expected) throw versionConflict(rowToStack(row));

  const now = new Date().toISOString();
  // 受影响的条目（成员关系变化 → 条目也要进 change_log）
  const { results: members } = await db
    .prepare(`SELECT entry_id FROM stack_entries WHERE stack_id = ?`)
    .bind(id)
    .all<{ entry_id: string }>();

  await db.batch([
    db
      .prepare(`UPDATE stacks SET deleted_at = ?, version = ?, updated_at = ? WHERE id = ?`)
      .bind(now, row.version + 1, now, id),
    db.prepare(`DELETE FROM stack_entries WHERE stack_id = ?`).bind(id),
    changeLogStmt(db, 'stack', id, 'delete', now),
    ...members.map((m) => changeLogStmt(db, 'entry', m.entry_id, 'upsert', now)),
  ]);
}

/** 批量调整成员：add/remove；成员变化记为条目与环境的变更。 */
export async function updateStackEntries(db: D1Database, id: string, payload: unknown) {
  const stack = await getStackRow(db, id);
  if (!stack) throw notFound('环境不存在或已删除');
  const parsed = stackEntriesUpdateSchema.safeParse(payload);
  if (!parsed.success)
    throw validationFailed('成员调整没有通过校验。', stackIssues(parsed.error.issues));
  const { add, remove } = parsed.data;
  const now = new Date().toISOString();

  for (const a of add) {
    const exists = await db
      .prepare(`SELECT 1 FROM entries WHERE id = ? AND deleted_at IS NULL`)
      .bind(a.entryId)
      .first();
    if (!exists) throw notFound(`条目 ${a.entryId} 不存在或已删除`);
  }

  const stmts = [];
  const touched = new Set<string>([...add.map((a) => a.entryId), ...remove]);
  for (const a of add) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO stack_entries (stack_id, entry_id, note, added_at) VALUES (?, ?, ?, ?)
           ON CONFLICT (stack_id, entry_id) DO UPDATE SET note = excluded.note`,
        )
        .bind(id, a.entryId, a.note, now),
    );
  }
  if (remove.length) {
    stmts.push(
      db
        .prepare(
          `DELETE FROM stack_entries WHERE stack_id = ? AND entry_id IN (${remove.map(() => '?').join(',')})`,
        )
        .bind(id, ...remove),
    );
  }
  stmts.push(changeLogStmt(db, 'stack', id, 'upsert', now));
  for (const entryId of touched) stmts.push(changeLogStmt(db, 'entry', entryId, 'upsert', now));
  await db.batch(stmts);
}

/** 修改某一条目在本环境的备注。 */
export async function setStackEntryNote(
  db: D1Database,
  stackId: string,
  entryId: string,
  payload: unknown,
) {
  const parsed = stackEntryNoteSchema.safeParse(payload);
  if (!parsed.success)
    throw validationFailed('备注没有通过校验。', stackIssues(parsed.error.issues));
  const row = await db
    .prepare(`SELECT 1 FROM stack_entries WHERE stack_id = ? AND entry_id = ?`)
    .bind(stackId, entryId)
    .first();
  if (!row) throw notFound('这个条目不在这个环境里');
  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(`UPDATE stack_entries SET note = ? WHERE stack_id = ? AND entry_id = ?`)
      .bind(parsed.data.note, stackId, entryId),
    changeLogStmt(db, 'stack', stackId, 'upsert', now),
    changeLogStmt(db, 'entry', entryId, 'upsert', now),
  ]);
}

/** 环境的成员条目（供安装清单）。 */
export async function stackMembers(db: D1Database, id: string) {
  const stack = await getStackRow(db, id);
  if (!stack) throw notFound('环境不存在或已删除');
  const { results } = await db
    .prepare(
      `SELECT e.id FROM entries e JOIN stack_entries se ON se.entry_id = e.id
       WHERE se.stack_id = ? AND e.deleted_at IS NULL`,
    )
    .bind(id)
    .all<{ id: string }>();
  const ids = results.map((r) => r.id);
  const empty = { stack: rowToStack(stack), entries: [] as ReturnType<typeof rowToEntry>[] };
  if (!ids.length) return empty;
  const { results: entryRows } = await db
    .prepare(
      `SELECT id, type, slug, title, summary, status, pinned, rating, platforms, tags, fields,
              snippets, links, body, version, created_at, updated_at, deleted_at
       FROM entries WHERE id IN (${ids.map(() => '?').join(',')}) AND deleted_at IS NULL`,
    )
    .bind(...ids)
    .all<Parameters<typeof rowToEntry>[0]>();
  const refs = await loadStackRefs(db, ids);
  const { rowToEntry } = await import('../db/mappers');
  return {
    stack: rowToStack(stack),
    entries: entryRows.map((r) => rowToEntry(r, refs.get(r.id) ?? [])),
  };
}
