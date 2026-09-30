// 行 ↔ 实体映射：snake_case 列与 camelCase JSON 的转换只发生在这一层（01-architecture#编码约定）。
import type {
  Entry,
  StoredSnippet,
  Link,
  StackRef,
  TypeDict,
  PlatformDict,
  Stack,
} from '@aikit/shared';
import type * as t from './schema';

type EntryRow = typeof t.entries.$inferSelect;
type StackRow = typeof t.stacks.$inferSelect;
type TypeRow = typeof t.types.$inferSelect;
type PlatformRow = typeof t.platforms.$inferSelect;

// 旧数据里的片段可能缺 id（列以 JSON 存储），读取时补一个稳定值。
function withSnippetIds(snippets: StoredSnippet[]): StoredSnippet[] {
  return snippets.map((s) => ({ ...s, id: s.id || hashSnippetId(s) }));
}

function hashSnippetId(s: StoredSnippet): string {
  const key = `${s.label}\u0000${s.lang}\u0000${s.code}`;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}

export function rowToEntry(row: EntryRow, stacks: StackRef[] = []): Entry {
  return {
    id: row.id,
    type: row.type,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    status: row.status as Entry['status'],
    pinned: row.pinned === 1,
    rating: row.rating,
    platforms: JSON.parse(row.platforms) as string[],
    tags: JSON.parse(row.tags) as string[],
    fields: JSON.parse(row.fields) as Record<string, string>,
    snippets: withSnippetIds(JSON.parse(row.snippets) as StoredSnippet[]),
    links: JSON.parse(row.links) as Link[],
    body: row.body,
    stacks,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

export function entryToRow(e: Entry): EntryRow {
  return {
    id: e.id,
    type: e.type,
    slug: e.slug,
    title: e.title,
    summary: e.summary,
    status: e.status,
    pinned: e.pinned ? 1 : 0,
    rating: e.rating,
    platforms: JSON.stringify(e.platforms),
    tags: JSON.stringify(e.tags),
    fields: JSON.stringify(e.fields),
    snippets: JSON.stringify(e.snippets),
    links: JSON.stringify(e.links),
    body: e.body,
    version: e.version,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    deletedAt: e.deletedAt,
  };
}

export function rowToStack(row: StackRow, entryCount = 0): Stack & { entryCount?: number } {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as Stack['kind'],
    os: row.os as Stack['os'],
    description: row.description,
    sort: row.sort,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    entryCount,
  };
}

export function rowToType(row: TypeRow): TypeDict {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    fieldTemplate: JSON.parse(row.fieldTemplate) as string[],
    sort: row.sort,
    builtin: row.builtin === 1,
    updatedAt: row.updatedAt,
  };
}

export function rowToPlatform(row: PlatformRow): PlatformDict {
  return {
    id: row.id,
    name: row.name,
    sort: row.sort,
    builtin: row.builtin === 1,
    updatedAt: row.updatedAt,
  };
}
