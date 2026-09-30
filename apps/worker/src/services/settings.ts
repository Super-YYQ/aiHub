// 设置与标签服务（03-api#类型、平台、标签与设置）。
import { settingsRulesSchema, tagRenameSchema, scanText } from '@aikit/shared';
import { changeLogStmt } from '../db/helpers';
import { AppError, validationFailed } from '../errors';
import { rowToEntry } from '../db/mappers';

/** 读取整理规则（键 rules）。 */
export async function getRules(db: D1Database): Promise<string> {
  const row = await db
    .prepare(`SELECT value FROM settings WHERE key = 'rules'`)
    .first<{ value: string }>();
  return row?.value ?? '';
}

/** 保存整理规则：密钥扫描 + change_log（entity 记为 setting）。 */
export async function putRules(db: D1Database, payload: unknown): Promise<string> {
  const parsed = settingsRulesSchema.safeParse(payload);
  if (!parsed.success)
    throw validationFailed(
      '整理规则没有通过校验。',
      parsed.error.issues.map((i) => ({
        path: i.path.join('.'),
        issue: i.code,
        message: i.message,
      })),
    );
  const hits = scanText(parsed.data.value, 'value');
  if (hits.length)
    throw new AppError(
      'secret_detected',
      422,
      '整理规则里疑似包含密钥，请改成 ${环境变量名} 这样的占位符。',
      hits.map((f) => ({ path: f.path, rule: f.ruleId, preview: f.preview, issue: 'secret' })),
    );
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES ('rules', ?, ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .bind(parsed.data.value, now)
    .run();
  await changeLogStmt(db, 'setting', 'rules', 'upsert', now).run();
  return parsed.data.value;
}

/**
 * 标签改名（目标已存在时相当于合并）：每个受影响条目都写修订与变更日志。
 * 逐条处理（单用户、标签量小），每条一个 batch 保证原子性。
 */
export async function renameTag(
  db: D1Database,
  payload: unknown,
  actor: string,
): Promise<{ renamed: number }> {
  const parsed = tagRenameSchema.safeParse(payload);
  if (!parsed.success)
    throw validationFailed(
      '标签改名没有通过校验。',
      parsed.error.issues.map((i) => ({
        path: i.path.join('.'),
        issue: i.code,
        message: i.message,
      })),
    );
  const { from, to } = parsed.data;

  const { results } = await db
    .prepare(`SELECT id, tags FROM entries WHERE deleted_at IS NULL AND tags LIKE ?`)
    .bind(`%${from}%`)
    .all<{ id: string; tags: string }>();

  const now = new Date().toISOString();
  let renamed = 0;
  for (const r of results) {
    const tags = JSON.parse(r.tags) as string[];
    const lower = tags.map((t) => t.toLowerCase());
    if (!lower.includes(from.toLowerCase())) continue;

    const kept = tags.filter((t) => t.toLowerCase() !== from.toLowerCase());
    if (!kept.some((t) => t.toLowerCase() === to.toLowerCase())) kept.push(to);

    const entryRow = await db
      .prepare(
        `SELECT id, type, slug, title, summary, status, pinned, rating, platforms, tags, fields,
                snippets, links, body, version, created_at, updated_at, deleted_at
         FROM entries WHERE id = ?`,
      )
      .bind(r.id)
      .first<Parameters<typeof rowToEntry>[0]>();
    if (!entryRow) continue;
    const current = rowToEntry(entryRow as Parameters<typeof rowToEntry>[0]);
    const updated = { ...current, tags: kept, version: current.version + 1, updatedAt: now };

    await db.batch([
      db
        .prepare(
          `INSERT INTO revisions (entry_id, version, snapshot, actor, created_at) VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(r.id, current.version, JSON.stringify(current), actor, now),
      db
        .prepare(`UPDATE entries SET tags = ?, version = ?, updated_at = ? WHERE id = ?`)
        .bind(JSON.stringify(kept), updated.version, now, r.id),
      changeLogStmt(db, 'entry', r.id, 'upsert', now),
    ]);
    renamed++;
  }
  return { renamed };
}
