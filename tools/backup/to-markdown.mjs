// to-markdown.mjs — 导出 JSON → Markdown 目录（02-data-model#markdown-镜像）：
//   entries/<type>/<slug>.md   一个条目一个文件
//   stacks/<环境名>.md          环境的条目列表和安装清单
//   README.md                  自动生成的目录
// 用法：node to-markdown.mjs export.json out/
// 确定性输出：同样输入两次生成完全相同的字节（序列化来自 @aikit/shared）。
import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { serializeEntry, buildChecklist, TYPE_ORDER, BUILTIN_TYPE_NAME_FALLBACK } from './lib.mjs';

const [, , fileArg, outArg] = process.argv;
if (!fileArg || !outArg) {
  console.error('用法：node to-markdown.mjs <export.json> <输出目录>');
  process.exit(2);
}

const data = JSON.parse(readFileSync(resolve(fileArg), 'utf8'));
const outDir = resolve(outArg);

// 覆盖式生成：先清掉旧的 entries/ 与 stacks/（README.md 重新写）
for (const dir of ['entries', 'stacks']) {
  rmSync(resolve(outDir, dir), { recursive: true, force: true });
}
mkdirSync(resolve(outDir, 'entries'), { recursive: true });
mkdirSync(resolve(outDir, 'stacks'), { recursive: true });

const typeName = (id) => {
  const t = (data.types ?? []).find((x) => x.id === id);
  return t?.name ?? BUILTIN_TYPE_NAME_FALLBACK[id] ?? id;
};

// ---------- 条目文件 ----------
const entryLines = [];
for (const entry of data.entries ?? []) {
  const dir = resolve(outDir, 'entries', entry.type);
  mkdirSync(dir, { recursive: true });
  const md = serializeEntry(entry, {
    stackName: (id) => (data.stacks ?? []).find((s) => s.id === id)?.name ?? id,
  });
  writeFileSync(resolve(dir, `${entry.slug}.md`), md, 'utf8');
  entryLines.push({ type: entry.type, slug: entry.slug, title: entry.title, status: entry.status });
}

// ---------- 环境文件（条目列表 + 安装清单） ----------
const stackLines = [];
for (const stack of data.stacks ?? []) {
  const members = (data.entries ?? []).filter((e) =>
    (e.stacks ?? []).some((r) => r.id === stack.id),
  );
  const lines = [
    `# ${stack.name}`,
    '',
    `- 类型：${stack.kind}`,
    `- 系统：${stack.os}`,
    stack.description ? `- 说明：${stack.description}` : null,
    `- 条目数：${members.length}`,
    '',
    '## 条目',
    '',
  ].filter((x) => x !== null);
  if (members.length) {
    for (const e of members) {
      lines.push(`- [ ] [${e.title}](../entries/${e.type}/${e.slug}.md)（${typeName(e.type)}）`);
    }
    lines.push('', '## 安装清单', '');
    lines.push(
      buildChecklist(stack.name, members, {
        typeName,
        typeOrder: Object.fromEntries((data.types ?? []).map((t) => [t.id, t.sort])),
      })
        .split('\n')
        .filter((l) => l && !l.startsWith(`# ${stack.name}`))
        .join('\n'),
      '',
    );
  } else {
    lines.push('（这个环境还没有条目）', '');
  }
  const fileName = `${stack.name.replace(/[\\/:*?"<>|]/g, '_')}.md`;
  writeFileSync(resolve(outDir, 'stacks', fileName), lines.join('\n'), 'utf8');
  stackLines.push({ name: stack.name, file: fileName, count: members.length });
}

// ---------- README（目录） ----------
const byType = new Map();
for (const e of entryLines) {
  const list = byType.get(e.type) ?? [];
  list.push(e);
  byType.set(e.type, list);
}
const readme = [
  '# AI 工作台数据镜像',
  '',
  `自动生成：${data.exportedAt ?? ''}。恢复一律用 \`export.json\`，Markdown 只供阅读。`,
  '',
  '## 目录',
  '',
  `- [条目（${entryLines.length}）](entries/)：按类型分目录，一个条目一个文件`,
  `- [环境（${stackLines.length}）](stacks/)`,
  '- `export.json`：完整导出（恢复用这个）',
  '',
  '## 环境一览',
  '',
  ...(stackLines.length
    ? stackLines.map((s) => `- [${s.name}](stacks/${s.file})（${s.count} 个条目）`)
    : ['（没有环境）']),
  '',
  '## 条目一览',
  '',
  ...[...byType.entries()]
    .sort(
      (a, b) => (TYPE_ORDER[a[0]] ?? 1000) - (TYPE_ORDER[b[0]] ?? 1000) || a[0].localeCompare(b[0]),
    )
    .flatMap(([type, list]) => [
      `### ${typeName(type)}（${list.length}）`,
      '',
      ...list.map((e) => `- [${e.title}](entries/${type}/${e.slug}.md)`),
      '',
    ]),
];
writeFileSync(resolve(outDir, 'README.md'), readme.join('\n'), 'utf8');

console.log(`已生成：${entryLines.length} 个条目文件、${stackLines.length} 个环境文件 → ${outDir}`);
