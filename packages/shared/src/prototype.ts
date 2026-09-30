// 原型数据转换：prototype/data.js 的 { stacks, entries } → 合法导入数据。
// 规则见 docs/detailed/02-data-model.md#导入（prototype 模式）。
import { ulid, snippetId } from './ids';

interface ProtoStack {
  id: string;
  name: string;
  kind: string;
  os: string;
  desc?: string;
}
interface ProtoSnippet {
  label?: string;
  lang?: string;
  code: string;
  install?: boolean;
}
interface ProtoLink {
  label?: string;
  url: string;
}
interface ProtoEntry {
  id?: string;
  type: string;
  slug: string;
  title: string;
  summary?: string;
  status?: string;
  pinned?: boolean;
  rating?: number;
  platforms?: string[];
  tags?: string[];
  stacks?: string[];
  fields?: Record<string, string>;
  snippets?: ProtoSnippet[];
  links?: ProtoLink[];
  body?: string;
  createdAt?: string;
  updatedAt?: string;
}
export interface PrototypeExport {
  stacks: ProtoStack[];
  entries: ProtoEntry[];
}

export interface ConvertedStack {
  id: string;
  name: string;
  kind: string;
  os: string;
  description: string;
  sort: number;
  createdAt: string;
  updatedAt: string;
}
export interface ConvertedEntry {
  id: string;
  type: string;
  slug: string;
  title: string;
  summary: string;
  status: string;
  pinned: boolean;
  rating: number;
  platforms: string[];
  tags: string[];
  fields: Record<string, string>;
  snippets: { id: string; label: string; lang: string; code: string; install: boolean }[];
  links: { label: string; url: string }[];
  body: string;
  stacks: { id: string; note: string }[];
  createdAt: string;
  updatedAt: string;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
function toIso(date: string | undefined, fallback: string): string {
  if (!date) return fallback;
  return DATE_ONLY.test(date) ? `${date}T00:00:00.000Z` : date;
}

export function convertPrototype(input: PrototypeExport): {
  stacks: ConvertedStack[];
  entries: ConvertedEntry[];
} {
  const now = new Date().toISOString();
  const idMap = new Map<string, string>();

  const stacks: ConvertedStack[] = (input.stacks ?? []).map((s, i) => {
    const newId = ulid();
    idMap.set(s.id, newId);
    return {
      id: newId,
      name: s.name,
      kind: s.kind,
      os: s.os,
      description: s.desc ?? '',
      sort: i,
      createdAt: now,
      updatedAt: now,
    };
  });

  const entries: ConvertedEntry[] = (input.entries ?? []).map((e) => {
    const created = toIso(e.createdAt, now);
    return {
      id: ulid(),
      type: e.type,
      slug: e.slug,
      title: e.title,
      summary: e.summary ?? '',
      status: e.status ?? 'inbox',
      pinned: Boolean(e.pinned),
      rating: e.rating ?? 0,
      platforms: e.platforms ?? [],
      tags: e.tags ?? [],
      fields: e.fields ?? {},
      snippets: (e.snippets ?? []).map((sn) => ({
        id: snippetId(),
        label: sn.label ?? '',
        lang: sn.lang ?? 'text',
        code: sn.code,
        install: Boolean(sn.install),
      })),
      links: (e.links ?? []).map((l) => ({ label: l.label ?? '', url: l.url })),
      body: e.body ?? '',
      stacks: (e.stacks ?? [])
        .map((oldId) => idMap.get(oldId))
        .filter((id): id is string => Boolean(id))
        .map((id) => ({ id, note: '' })),
      createdAt: created,
      updatedAt: toIso(e.updatedAt, created),
    };
  });

  return { stacks, entries };
}
