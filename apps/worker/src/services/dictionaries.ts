// 字典服务：类型与平台的增删改查（03-api#类型、平台、标签与设置）。
import {
  typeWriteSchema,
  platformWriteSchema,
  TYPE_ID_RE,
  scanText,
  type TypeDict,
  type PlatformDict,
} from '@aikit/shared';
import { rowToType, rowToPlatform, type TypeRow, type PlatformRow } from '../db/mappers';
import { changeLogStmt } from '../db/helpers';
import { AppError, inUse, notFound, validationFailed } from '../errors';

function issues(
  zodIssues: Array<{ path: (string | number | symbol)[]; code: string; message: string }>,
) {
  return zodIssues.map((i) => ({ path: i.path.join('.'), issue: i.code, message: i.message }));
}

function secretDetail(f: { path: string; ruleId: string; preview: string }) {
  return { path: f.path, rule: f.ruleId, preview: f.preview, issue: 'secret' };
}

// ---------- 类型 ----------
export async function listTypes(db: D1Database): Promise<TypeDict[]> {
  const { results } = await db.prepare(`SELECT * FROM types ORDER BY sort, id`).all<TypeRow>();
  return results.map(rowToType);
}

export async function getType(db: D1Database, id: string): Promise<TypeDict | null> {
  const row = await db.prepare(`SELECT * FROM types WHERE id = ?`).bind(id).first<TypeRow>();
  return row ? rowToType(row) : null;
}

export async function createType(db: D1Database, id: string, payload: unknown): Promise<TypeDict> {
  if (!TYPE_ID_RE.test(id))
    throw validationFailed('类型 ID 需匹配 ^[a-z][a-z0-9-]{1,23}$', [
      { path: 'id', issue: 'invalid', message: `类型 ID ${id} 不合法` },
    ]);
  const parsed = typeWriteSchema.safeParse(payload);
  if (!parsed.success)
    throw validationFailed('类型信息没有通过校验。', issues(parsed.error.issues));
  // 字典写入同样做密钥扫描（名称/模板键）
  for (const text of [parsed.data.name, ...parsed.data.fieldTemplate]) {
    const hits = scanText(text, 'fieldTemplate');
    if (hits.length)
      throw new AppError('secret_detected', 422, '内容里疑似包含密钥。', hits.map(secretDetail));
  }
  const dup = await db.prepare(`SELECT 1 FROM types WHERE id = ?`).bind(id).first();
  if (dup) throw new AppError('slug_taken', 409, `类型 ID “${id}”已被占用`);
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO types (id, name, color, field_template, sort, builtin, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?)`,
    )
    .bind(
      id,
      parsed.data.name,
      parsed.data.color,
      JSON.stringify(parsed.data.fieldTemplate),
      parsed.data.sort,
      now,
    )
    .run();
  await changeLogStmt(db, 'type', id, 'upsert', now).run();
  return {
    id,
    name: parsed.data.name,
    color: parsed.data.color,
    fieldTemplate: parsed.data.fieldTemplate,
    sort: parsed.data.sort,
    builtin: false,
    updatedAt: now,
  };
}

export async function updateType(db: D1Database, id: string, payload: unknown): Promise<TypeDict> {
  const existing = await getType(db, id);
  if (!existing) throw notFound('类型不存在');
  const parsed = typeWriteSchema.safeParse(payload);
  if (!parsed.success)
    throw validationFailed('类型信息没有通过校验。', issues(parsed.error.issues));
  for (const text of [parsed.data.name, ...parsed.data.fieldTemplate]) {
    const hits = scanText(text, 'fieldTemplate');
    if (hits.length)
      throw new AppError('secret_detected', 422, '内容里疑似包含密钥。', hits.map(secretDetail));
  }
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE types SET name = ?, color = ?, field_template = ?, sort = ?, updated_at = ? WHERE id = ?`,
    )
    .bind(
      parsed.data.name,
      parsed.data.color,
      JSON.stringify(parsed.data.fieldTemplate),
      parsed.data.sort,
      now,
      id,
    )
    .run();
  await changeLogStmt(db, 'type', id, 'upsert', now).run();
  return { ...existing, ...parsed.data, updatedAt: now };
}

export async function deleteType(db: D1Database, id: string): Promise<void> {
  const existing = await getType(db, id);
  if (!existing) throw notFound('类型不存在');
  if (existing.builtin) throw inUse('内置类型不能删除，只能改名或改颜色。');
  const used = await db
    .prepare(`SELECT 1 FROM entries WHERE type = ? AND deleted_at IS NULL LIMIT 1`)
    .bind(id)
    .first();
  if (used) throw inUse('仍有条目使用这个类型，先改掉那些条目再删除。');
  const now = new Date().toISOString();
  await db.prepare(`DELETE FROM types WHERE id = ?`).bind(id).run();
  await changeLogStmt(db, 'type', id, 'delete', now).run();
}

// ---------- 平台 ----------
export async function listPlatforms(db: D1Database): Promise<PlatformDict[]> {
  const { results } = await db
    .prepare(`SELECT * FROM platforms ORDER BY sort, id`)
    .all<PlatformRow>();
  return results.map(rowToPlatform);
}

export async function createPlatform(
  db: D1Database,
  id: string,
  payload: unknown,
): Promise<PlatformDict> {
  if (!TYPE_ID_RE.test(id))
    throw validationFailed('平台 ID 需匹配 ^[a-z][a-z0-9-]{1,23}$', [
      { path: 'id', issue: 'invalid', message: `平台 ID ${id} 不合法` },
    ]);
  const parsed = platformWriteSchema.safeParse(payload);
  if (!parsed.success)
    throw validationFailed('平台信息没有通过校验。', issues(parsed.error.issues));
  const hits = scanText(parsed.data.name, 'name');
  if (hits.length)
    throw new AppError('secret_detected', 422, '内容里疑似包含密钥。', hits.map(secretDetail));
  const dup = await db.prepare(`SELECT 1 FROM platforms WHERE id = ?`).bind(id).first();
  if (dup) throw new AppError('slug_taken', 409, `平台 ID “${id}”已被占用`);
  const now = new Date().toISOString();
  await db
    .prepare(`INSERT INTO platforms (id, name, sort, builtin, updated_at) VALUES (?, ?, ?, 0, ?)`)
    .bind(id, parsed.data.name, parsed.data.sort, now)
    .run();
  await changeLogStmt(db, 'platform', id, 'upsert', now).run();
  return { id, name: parsed.data.name, sort: parsed.data.sort, builtin: false, updatedAt: now };
}

export async function updatePlatform(
  db: D1Database,
  id: string,
  payload: unknown,
): Promise<PlatformDict> {
  const row = await db
    .prepare(`SELECT * FROM platforms WHERE id = ?`)
    .bind(id)
    .first<PlatformRow>();
  if (!row) throw notFound('平台不存在');
  const parsed = platformWriteSchema.safeParse(payload);
  if (!parsed.success)
    throw validationFailed('平台信息没有通过校验。', issues(parsed.error.issues));
  const hits = scanText(parsed.data.name, 'name');
  if (hits.length)
    throw new AppError('secret_detected', 422, '内容里疑似包含密钥。', hits.map(secretDetail));
  const now = new Date().toISOString();
  await db
    .prepare(`UPDATE platforms SET name = ?, sort = ?, updated_at = ? WHERE id = ?`)
    .bind(parsed.data.name, parsed.data.sort, now, id)
    .run();
  await changeLogStmt(db, 'platform', id, 'upsert', now).run();
  return { ...rowToPlatform(row), ...parsed.data, updatedAt: now };
}

export async function deletePlatform(db: D1Database, id: string): Promise<void> {
  const row = await db
    .prepare(`SELECT * FROM platforms WHERE id = ?`)
    .bind(id)
    .first<PlatformRow>();
  if (!row) throw notFound('平台不存在');
  if (rowToPlatform(row).builtin) throw inUse('内置平台不能删除。');
  // platforms 存在条目的 JSON 列里：用 LIKE 粗筛再精确判断
  const { results } = await db
    .prepare(`SELECT id, platforms FROM entries WHERE deleted_at IS NULL AND platforms LIKE ?`)
    .bind(`%"${id}"%`)
    .all<{ id: string; platforms: string }>();
  for (const r of results) {
    const arr = JSON.parse(r.platforms) as string[];
    if (arr.includes(id)) throw inUse('仍有条目使用这个平台，先改掉那些条目再删除。');
  }
  const now = new Date().toISOString();
  await db.prepare(`DELETE FROM platforms WHERE id = ?`).bind(id).run();
  await changeLogStmt(db, 'platform', id, 'delete', now).run();
}
