// 安装清单：按类型分组、待勾选，附各条目标记为“安装命令”的片段（见 docs/detailed/03-api.md 环境）。
import { BUILTIN_TYPES, TYPE_ORDER } from './dictionaries.js';
import { fenceFor } from './markdown.js';

const BUILTIN_TYPE_NAME: Record<string, string> = Object.fromEntries(
  BUILTIN_TYPES.map((t) => [t.id, t.name]),
);

export interface ChecklistSnippet {
  lang?: string;
  code: string;
  install?: boolean;
}
export interface ChecklistEntry {
  type: string;
  title: string;
  snippets?: ChecklistSnippet[];
}

export interface ChecklistOptions {
  typeName?: (id: string) => string;
  typeOrder?: Record<string, number>;
}

/** 生成某环境的安装清单 Markdown（按类型分组，安装命令做成代码块）。 */
export function buildChecklist(
  stackName: string,
  entries: ChecklistEntry[],
  options: ChecklistOptions = {},
): string {
  const typeName = options.typeName ?? ((id: string) => BUILTIN_TYPE_NAME[id] ?? id);
  const order = options.typeOrder ?? TYPE_ORDER;
  const rank = (id: string) => (id in order ? order[id] : 1000);

  const typeIds = Array.from(new Set(entries.map((e) => e.type))).sort(
    (a, b) => rank(a) - rank(b) || a.localeCompare(b),
  );

  const out: string[] = [`# ${stackName} 安装清单`, ''];
  for (const typeId of typeIds) {
    const group = entries
      .filter((e) => e.type === typeId)
      .sort((a, b) => a.title.localeCompare(b.title, 'zh'));
    if (!group.length) continue;
    out.push(`## ${typeName(typeId)}`, '');
    for (const e of group) {
      out.push(`- [ ] ${e.title}`);
      for (const sn of (e.snippets ?? []).filter((s) => s.install)) {
        const fence = fenceFor(sn.code);
        out.push('', fence + (sn.lang ?? ''), sn.code, fence);
      }
      out.push('');
    }
  }
  return out.join('\n');
}
