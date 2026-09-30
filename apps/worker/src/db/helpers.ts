// 数据访问基础：实体读取的通用助手（服务层共用）。
import type { StackRef } from '@aikit/shared';

/** 读取条目的环境引用（stack_entries 组装为条目的 stacks 字段）。 */
export async function loadStackRefs(
  db: D1Database,
  entryIds: string[],
): Promise<Map<string, StackRef[]>> {
  const map = new Map<string, StackRef[]>();
  if (!entryIds.length) return map;
  const placeholders = entryIds.map(() => '?').join(',');
  const { results } = await db
    .prepare(
      `SELECT stack_id, entry_id, note FROM stack_entries WHERE entry_id IN (${placeholders})`,
    )
    .bind(...entryIds)
    .all<{ stack_id: string; entry_id: string; note: string }>();
  for (const row of results) {
    const list = map.get(row.entry_id) ?? [];
    list.push({ id: row.stack_id, note: row.note });
    map.set(row.entry_id, list);
  }
  return map;
}

/** 变更日志追加（写入顺序的最后一步）。 */
export function changeLogStmt(
  db: D1Database,
  entity: string,
  entityId: string,
  op: 'upsert' | 'delete',
  at: string,
) {
  return db
    .prepare(`INSERT INTO change_log (entity, entity_id, op, at) VALUES (?, ?, ?, ?)`)
    .bind(entity, entityId, op, at);
}

/** 变更日志支持的实体名（02-data-model 表结构注释）。 */
export type ChangeLogEntity = 'entry' | 'stack' | 'type' | 'platform' | 'proposal' | 'setting';
