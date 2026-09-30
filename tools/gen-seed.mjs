// 生成 apps/worker/seed/seed.json：由 prototype/data.js 按原型转换规则生成（WP2）。
// 运行：node tools/gen-seed.mjs（在仓库根）。转换逻辑在 packages/shared/src/prototype.ts。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

// 读取 prototype/data.js 里的 window.AIKIT_SEED
const src = readFileSync(resolve(root, 'prototype/data.js'), 'utf8');
const win = {};
const seed = new Function('window', `${src}\nreturn window.AIKIT_SEED;`)(win);

// 复用 packages/shared 的转换逻辑（先 pnpm --filter @aikit/shared run build）
const { convertPrototype } = await import(
  pathToFileURL(resolve(root, 'packages/shared/dist/index.js')).href
);

const { stacks, entries } = convertPrototype(seed);
const out = {
  schemaVersion: 1,
  generatedFrom: 'prototype/data.js',
  stacks,
  entries,
};

mkdirSync(resolve(root, 'apps/worker/seed'), { recursive: true });
const dest = resolve(root, 'apps/worker/seed/seed.json');
writeFileSync(dest, JSON.stringify(out, null, 2) + '\n');
console.log(`seed.json: ${entries.length} 条目、${stacks.length} 环境 → ${dest}`);
