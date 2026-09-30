// Markdown 序列化：确定性字节输出，YAML 头键序见 docs/detailed/02-data-model.md#markdown-镜像。
// 与前端“复制为 Markdown”和备份的 <type>/<slug>.md 共用。

export interface SerializableSnippet {
  label?: string;
  lang?: string;
  code: string;
  install?: boolean;
}
export interface SerializableLink {
  label?: string;
  url: string;
}
export interface SerializableStackRef {
  id: string;
  note?: string;
}
export interface SerializableEntry {
  id: string;
  type: string;
  title: string;
  status: string;
  pinned?: boolean;
  rating?: number;
  platforms?: string[];
  tags?: string[];
  stacks?: (SerializableStackRef | string)[];
  createdAt: string;
  updatedAt: string;
  fields?: Record<string, string>;
  summary?: string;
  snippets?: SerializableSnippet[];
  links?: SerializableLink[];
  body?: string;
}

export interface SerializeOptions {
  /** 环境 ID → 名称；YAML 头的 stacks 写环境名（默认用 ID）。 */
  stackName?: (id: string) => string;
}

const q = (v: unknown): string => JSON.stringify(v);

/** 代码围栏长度：片段内最长连续反引号数 + 1，最少 3。 */
export function fenceFor(code: string): string {
  let max = 0;
  let run = 0;
  for (const ch of String(code)) {
    if (ch === '`') {
      run++;
      if (run > max) max = run;
    } else {
      run = 0;
    }
  }
  return '`'.repeat(Math.max(3, max + 1));
}

function stackNames(entry: SerializableEntry, resolve: (id: string) => string): string[] {
  return (entry.stacks ?? []).map((s) => (typeof s === 'string' ? resolve(s) : resolve(s.id)));
}

/** 把条目序列化为带 YAML 头的 Markdown（同输入两次输出逐字节相同）。 */
export function serializeEntry(entry: SerializableEntry, options: SerializeOptions = {}): string {
  const resolve = options.stackName ?? ((id: string) => id);
  const lines: string[] = [
    '---',
    `id: ${q(entry.id)}`,
    `type: ${q(entry.type)}`,
    `title: ${q(entry.title)}`,
    `status: ${q(entry.status)}`,
    `pinned: ${entry.pinned ? 'true' : 'false'}`,
    `rating: ${entry.rating ?? 0}`,
    `platforms: ${q(entry.platforms ?? [])}`,
    `tags: ${q(entry.tags ?? [])}`,
    `stacks: ${q(stackNames(entry, resolve))}`,
    `created: ${q(entry.createdAt)}`,
    `updated: ${q(entry.updatedAt)}`,
  ];
  const fieldEntries = Object.entries(entry.fields ?? {});
  if (fieldEntries.length) {
    lines.push('fields:');
    for (const [k, v] of fieldEntries) lines.push(`  ${q(k)}: ${q(v)}`);
  }
  lines.push('---', '');

  if (entry.summary) lines.push(entry.summary, '');
  for (const s of entry.snippets ?? []) {
    const fence = fenceFor(s.code);
    lines.push(
      `## ${s.label || '片段'}${s.install ? '（安装）' : ''}`,
      '',
      fence + (s.lang ?? ''),
      s.code,
      fence,
      '',
    );
  }
  if (entry.body) lines.push(entry.body, '');
  const links = entry.links ?? [];
  if (links.length) {
    lines.push('## 链接', '', ...links.map((l) => `- [${l.label || l.url}](${l.url})`), '');
  }
  return lines.join('\n');
}
