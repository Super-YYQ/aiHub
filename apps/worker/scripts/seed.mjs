// pnpm seed — 把 apps/worker/seed/seed.json 导入本地 D1（wrangler dev 的 sqlite 文件）。
// 用法：node scripts/seed.mjs [--remote]；--remote 导入远程库（需 wrangler login）。
// 幂等：按 id 判断存在即跳过，重复执行不会重复插入。
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const workerDir = resolve(here, '..');
const seedPath = resolve(workerDir, 'seed/seed.json');
const remote = process.argv.includes('--remote');

const seed = JSON.parse(readFileSync(seedPath, 'utf8'));
const now = new Date().toISOString();

// SQL 字面量转义：字符串 → 'xxx'（单引号翻倍），数字/布尔 → 字面量，null → NULL。
function lit(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

function wranglerExecute(sql) {
  // Windows shell 会把多词参数打散，所以用临时文件传 SQL。
  const tmp = resolve(
    tmpdir(),
    `aikit-seed-${Date.now()}-${Math.random().toString(36).slice(2)}.sql`,
  );
  writeFileSync(tmp, sql, 'utf8');
  try {
    return execFileSync(
      'pnpm',
      [
        'exec',
        'wrangler',
        'd1',
        'execute',
        'ai-kit',
        '--json',
        ...(remote ? ['--remote'] : ['--local']),
        '--file',
        tmp,
      ],
      {
        cwd: workerDir,
        encoding: 'utf8',
        shell: process.platform === 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
  } finally {
    unlinkSync(tmp);
  }
}

const stmts = [];
for (const s of seed.stacks) {
  stmts.push(`INSERT INTO stacks (id, name, kind, os, description, sort, created_at, updated_at, deleted_at)
       SELECT ${lit(s.id)}, ${lit(s.name)}, ${lit(s.kind)}, ${lit(s.os)}, ${lit(s.description)}, ${lit(s.sort)}, ${lit(s.createdAt)}, ${lit(s.updatedAt)}, NULL
       WHERE NOT EXISTS (SELECT 1 FROM stacks WHERE id = ${lit(s.id)});`);
}
for (const e of seed.entries) {
  stmts.push(`INSERT INTO entries (id, type, slug, title, summary, status, pinned, rating, platforms, tags, fields, snippets, links, body, version, created_at, updated_at, deleted_at)
       SELECT ${lit(e.id)}, ${lit(e.type)}, ${lit(e.slug)}, ${lit(e.title)}, ${lit(e.summary)}, ${lit(e.status)}, ${lit(e.pinned)}, ${lit(e.rating)},
              ${lit(e.platforms)}, ${lit(e.tags)}, ${lit(e.fields)}, ${lit(e.snippets)}, ${lit(e.links)}, ${lit(e.body)},
              1, ${lit(e.createdAt)}, ${lit(e.updatedAt)}, NULL
       WHERE NOT EXISTS (SELECT 1 FROM entries WHERE id = ${lit(e.id)});`);
  for (const ref of e.stacks ?? []) {
    stmts.push(`INSERT INTO stack_entries (stack_id, entry_id, note, added_at)
         SELECT ${lit(ref.id)}, ${lit(e.id)}, ${lit(ref.note ?? '')}, ${lit(now)}
         WHERE NOT EXISTS (SELECT 1 FROM stack_entries WHERE stack_id = ${lit(ref.id)} AND entry_id = ${lit(e.id)});`);
  }
}

wranglerExecute(stmts.join('\n'));
console.log(
  `seed 完成：${seed.entries.length} 条目、${seed.stacks.length} 环境 → ${remote ? '远程' : '本地'} D1`,
);
