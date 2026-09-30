// 行 ↔ 实体映射：snake_case 列与 camelCase JSON 的转换只发生在这一层（01-architecture#编码约定）。
// 行形状与 D1 查询结果一致（snake_case）；写入的 SQL 绑定在各服务里组装。
import type {
  Entry,
  StoredSnippet,
  Link,
  StackRef,
  TypeDict,
  PlatformDict,
  Stack,
} from '@aikit/shared';

export interface EntryRow {
  id: string;
  type: string;
  slug: string;
  title: string;
  summary: string;
  status: string;
  pinned: number;
  rating: number;
  platforms: string;
  tags: string;
  fields: string;
  snippets: string;
  links: string;
  body: string;
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface StackRow {
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
}

export interface TypeRow {
  id: string;
  name: string;
  color: string;
  field_template: string;
  sort: number;
  builtin: number;
  updated_at: string;
}

export interface PlatformRow {
  id: string;
  name: string;
  sort: number;
  builtin: number;
  updated_at: string;
}

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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
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
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    entryCount,
  };
}

export function rowToType(row: TypeRow): TypeDict {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    fieldTemplate: JSON.parse(row.field_template) as string[],
    sort: row.sort,
    builtin: row.builtin === 1,
    updatedAt: row.updated_at,
  };
}

export function rowToPlatform(row: PlatformRow): PlatformDict {
  return {
    id: row.id,
    name: row.name,
    sort: row.sort,
    builtin: row.builtin === 1,
    updatedAt: row.updated_at,
  };
}
