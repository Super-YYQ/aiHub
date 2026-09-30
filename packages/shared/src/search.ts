// 搜索与高亮（规则见 docs/detailed/04-frontend.md#搜索，与原型 prototype/app.js 一致）。
import { BUILTIN_TYPES } from './dictionaries';

export interface SearchableEntry {
  id: string;
  type: string;
  slug: string;
  title: string;
  summary?: string;
  tags?: string[];
  fields?: Record<string, string>;
  snippets?: { label?: string; code?: string }[];
  body?: string;
  status?: string;
  pinned?: boolean;
}

export interface SearchOptions {
  /** 类型 ID → 显示名；默认用内置类型名，未知类型回退为 ID 本身。 */
  typeName?: (typeId: string) => string;
  limit?: number;
}

const BUILTIN_TYPE_NAME: Record<string, string> = Object.fromEntries(
  BUILTIN_TYPES.map((t) => [t.id, t.name]),
);
const defaultTypeName = (id: string) => BUILTIN_TYPE_NAME[id] ?? id;

export function tokenize(q: string): string[] {
  return String(q).toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * 计算一个条目对查询词的得分；任一词未命中返回 null（AND 语义，排除该条目）。
 * 权重：类型精确 +10；名称/标识前缀 +12、包含 +8；说明/标签/要点/类型名 +4；片段/笔记 +1；
 * 已弃用 -3；置顶 +1。
 */
export function scoreEntry(
  entry: SearchableEntry,
  terms: string[],
  typeName: (id: string) => string = defaultTypeName,
): number | null {
  const tName = typeName(entry.type).toLowerCase();
  const title = `${entry.title} ${entry.slug}`.toLowerCase();
  const meta = [
    typeName(entry.type),
    entry.type,
    entry.summary ?? '',
    ...(entry.tags ?? []),
    ...Object.values(entry.fields ?? {}),
  ]
    .join(' ')
    .toLowerCase();
  const deep = [
    ...(entry.snippets ?? []).map((s) => `${s.label ?? ''} ${s.code ?? ''}`),
    entry.body ?? '',
  ]
    .join(' ')
    .toLowerCase();

  let score = 0;
  for (const t of terms) {
    if (t === entry.type || t === tName) score += 10;
    else if (title.includes(t)) score += title.startsWith(t) ? 12 : 8;
    else if (meta.includes(t)) score += 4;
    else if (deep.includes(t)) score += 1;
    else return null;
  }
  if (entry.status === 'archived') score -= 3;
  if (entry.pinned) score += 1;
  return score;
}

/** 按查询排序返回命中条目（稳定排序，分数相同保持原顺序）。 */
export function searchEntries<T extends SearchableEntry>(
  entries: T[],
  query: string,
  options: SearchOptions = {},
): T[] {
  const terms = tokenize(query);
  if (!terms.length) return [];
  const typeName = options.typeName ?? defaultTypeName;
  const hits: { e: T; score: number; i: number }[] = [];
  entries.forEach((e, i) => {
    const score = scoreEntry(e, terms, typeName);
    if (score != null) hits.push({ e, score, i });
  });
  hits.sort((a, b) => b.score - a.score || a.i - b.i);
  const out = hits.map((h) => h.e);
  return options.limit != null ? out.slice(0, options.limit) : out;
}

export interface HighlightSegment {
  text: string;
  hit: boolean;
}

/** 按字符位置标记命中片段（不由用户输入拼正则）；供 UI 决定渲染方式。 */
export function highlightSegments(text: string, terms: string[]): HighlightSegment[] {
  const s = String(text ?? '');
  const low = s.toLowerCase();
  if (!terms.length || low.length !== s.length) return s ? [{ text: s, hit: false }] : [];
  const hit = new Array(s.length).fill(false);
  for (const t of terms) {
    if (!t) continue;
    for (let i = low.indexOf(t); i !== -1; i = low.indexOf(t, i + t.length)) {
      for (let k = i; k < i + t.length; k++) hit[k] = true;
    }
  }
  const segs: HighlightSegment[] = [];
  let cur = '';
  let on = false;
  for (let k = 0; k < s.length; k++) {
    if (hit[k] !== on) {
      if (cur) segs.push({ text: cur, hit: on });
      cur = '';
      on = hit[k];
    }
    cur += s[k];
  }
  if (cur) segs.push({ text: cur, hit: on });
  return segs;
}
