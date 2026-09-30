// 同步服务（03-api#同步）：读 change_log 中 seq > since 的行，
// 按实体去重取当前状态；删除只返回 ID；proposals 只含 pending。
export interface SyncResult {
  entries: unknown[];
  stacks: unknown[];
  types: unknown[];
  platforms: unknown[];
  proposals: unknown[];
  deleted: { entries: string[]; stacks: string[]; types: string[]; platforms: string[] };
  cursor: number;
  hasMore: boolean;
}

export async function sync(db: D1Database, since: number, limit: number): Promise<SyncResult> {
  const capped = Math.min(Math.max(limit, 1), 500);

  // 取一段变更日志（按 seq 升序）
  const { results } = await db
    .prepare(
      `SELECT seq, entity, entity_id, op FROM change_log WHERE seq > ? ORDER BY seq ASC LIMIT ?`,
    )
    .bind(since, capped + 1)
    .all<{ seq: number; entity: string; entity_id: string; op: string }>();

  const page = results.slice(0, capped);
  const hasMore = results.length > capped;
  const cursor = page.length ? page[page.length - 1].seq : since;

  // 按实体去重（后写的覆盖先写的；upsert 后又 delete 的按 delete 算）
  const latest = new Map<string, { entity: string; id: string; op: string }>();
  for (const row of page) {
    latest.set(`${row.entity}:${row.entity_id}`, {
      entity: row.entity,
      id: row.entity_id,
      op: row.op,
    });
  }

  const deleted: SyncResult['deleted'] = { entries: [], stacks: [], types: [], platforms: [] };
  const ids = {
    entry: new Set<string>(),
    stack: new Set<string>(),
    type: new Set<string>(),
    platform: new Set<string>(),
  };
  for (const v of latest.values()) {
    if (v.op === 'delete') {
      if (v.entity === 'entry') deleted.entries.push(v.id);
      else if (v.entity === 'stack') deleted.stacks.push(v.id);
      else if (v.entity === 'type') deleted.types.push(v.id);
      else if (v.entity === 'platform') deleted.platforms.push(v.id);
    } else if (v.entity in ids) {
      ids[v.entity as keyof typeof ids].add(v.id);
    }
  }

  const empty = {
    entries: [] as unknown[],
    stacks: [] as unknown[],
    types: [] as unknown[],
    platforms: [] as unknown[],
    proposals: [] as unknown[],
  };

  if (since === 0 && !page.length) {
    // since=0 的空库：cursor 取当前最大 seq（可能是 0）
    const max = await db
      .prepare(`SELECT COALESCE(MAX(seq), 0) AS m FROM change_log`)
      .first<{ m: number }>();
    return { ...empty, deleted, cursor: max?.m ?? 0, hasMore: false };
  }

  // 组装当前状态
  const { rowToEntry, rowToStack, rowToType, rowToPlatform } = await import('../db/mappers');
  const { loadStackRefs } = await import('../db/helpers');

  if (ids.entry.size) {
    const list = [...ids.entry];
    const { results: rows } = await db
      .prepare(
        `SELECT id, type, slug, title, summary, status, pinned, rating, platforms, tags, fields,
                snippets, links, body, version, created_at, updated_at, deleted_at
         FROM entries WHERE id IN (${list.map(() => '?').join(',')})`,
      )
      .bind(...list)
      .all<Parameters<typeof rowToEntry>[0]>();
    const refs = await loadStackRefs(db, list);
    empty.entries = rows
      .filter((r) => !(r as { deleted_at: string | null }).deleted_at)
      .map((r) =>
        rowToEntry(r as Parameters<typeof rowToEntry>[0], refs.get((r as { id: string }).id) ?? []),
      );
    // 已删除但日志里是 upsert 的（不应发生，防御）：归入 deleted
    for (const r of rows) {
      if ((r as { deleted_at: string | null }).deleted_at)
        deleted.entries.push((r as { id: string }).id);
    }
  }

  if (ids.stack.size) {
    const list = [...ids.stack];
    const { results: rows } = await db
      .prepare(
        `SELECT id, name, kind, os, description, sort, version, created_at, updated_at, deleted_at
         FROM stacks WHERE id IN (${list.map(() => '?').join(',')}) AND deleted_at IS NULL`,
      )
      .bind(...list)
      .all<Parameters<typeof rowToStack>[0]>();
    empty.stacks = rows.map((r) => rowToStack(r));
  }

  if (ids.type.size) {
    const list = [...ids.type];
    const { results: rows } = await db
      .prepare(`SELECT * FROM types WHERE id IN (${list.map(() => '?').join(',')})`)
      .bind(...list)
      .all<Parameters<typeof rowToType>[0]>();
    empty.types = rows.map((r) => rowToType(r));
  }

  if (ids.platform.size) {
    const list = [...ids.platform];
    const { results: rows } = await db
      .prepare(`SELECT * FROM platforms WHERE id IN (${list.map(() => '?').join(',')})`)
      .bind(...list)
      .all<Parameters<typeof rowToPlatform>[0]>();
    empty.platforms = rows.map((r) => rowToPlatform(r));
  }

  // 待确认数量用 pending 提案（列表只在有变更涉及提案时返回；03-api：proposals 只含 pending）
  if ([...latest.values()].some((v) => v.entity === 'proposal')) {
    const { results: rows } = await db
      .prepare(
        `SELECT * FROM proposals WHERE status = 'pending' ORDER BY created_at DESC LIMIT 500`,
      )
      .all();
    empty.proposals = rows;
  }

  return { ...empty, deleted, cursor, hasMore };
}
