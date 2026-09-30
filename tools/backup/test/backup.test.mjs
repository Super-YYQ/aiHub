// 备份工具测试：check-export 的闸门行为 + to-markdown 的确定性与文件结构。
// 用真实的种子导出（apps/worker/seed/seed.json + 内置字典）作为输入。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, rmSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const run = (script, args) =>
  execFileSync('node', [resolve(here, '..', script), ...args], {
    cwd: here,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });

const seed = JSON.parse(readFileSync(resolve(root, 'apps/worker/seed/seed.json'), 'utf8'));
const exportData = {
  schemaVersion: 1,
  exportedAt: '2026-09-30T00:00:00.000Z',
  types: [
    { id: 'tool', name: '工具', color: '#2f6db5', fieldTemplate: [], sort: 0, builtin: true },
    { id: 'prompt', name: '提示词', color: '#8349bd', fieldTemplate: [], sort: 1, builtin: true },
    { id: 'skill', name: 'Skill', color: '#237f50', fieldTemplate: [], sort: 2, builtin: true },
    { id: 'mcp', name: 'MCP', color: '#c43d32', fieldTemplate: [], sort: 3, builtin: true },
    { id: 'hook', name: 'Hook', color: '#a36700', fieldTemplate: [], sort: 4, builtin: true },
    { id: 'plugin', name: '插件', color: '#0b7a87', fieldTemplate: [], sort: 5, builtin: true },
    { id: 'config', name: '配置', color: '#56626f', fieldTemplate: [], sort: 6, builtin: true },
    {
      id: 'model',
      name: '模型与 API',
      color: '#ad3571',
      fieldTemplate: [],
      sort: 7,
      builtin: true,
    },
  ],
  platforms: [],
  stacks: seed.stacks,
  entries: seed.entries,
  settings: { rules: '' },
};

const tmp = resolve(here, '.tmp');
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

const writeExport = (name, data) => {
  const file = resolve(tmp, name);
  writeFileSync(file, JSON.stringify(data), 'utf8');
  return file;
};

test('check-export：有效导出通过并打印条目数', () => {
  const file = writeExport('ok.json', exportData);
  const out = run('check-export.mjs', [file]);
  assert.match(out, /21 条条目/);
});

test('check-export：条目数为 0 时失败（保护镜像不被空数据覆盖）', () => {
  const file = writeExport('empty.json', { ...exportData, entries: [] });
  assert.throws(() => run('check-export.mjs', [file]), /条目数为 0/);
});

test('check-export：schemaVersion 不符时失败', () => {
  const file = writeExport('bad-version.json', { ...exportData, schemaVersion: 2 });
  assert.throws(() => run('check-export.mjs', [file]), /schemaVersion/);
});

test('to-markdown：生成 entries/ stacks/ README，且输出确定（两次逐字节相同）', () => {
  const file = writeExport('ok.json', exportData);
  const out1 = resolve(tmp, 'out1');
  const out2 = resolve(tmp, 'out2');
  run('to-markdown.mjs', [file, out1]);
  run('to-markdown.mjs', [file, out2]);

  const types = readdirSync(resolve(out1, 'entries'));
  assert.ok(types.includes('tool'));
  assert.ok(types.includes('plugin'));
  const toolFiles = readdirSync(resolve(out1, 'entries', 'tool'));
  assert.ok(toolFiles.includes('claude-code.md'));

  assert.ok(existsSync(resolve(out1, 'stacks')));
  assert.ok(existsSync(resolve(out1, 'README.md')));

  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true })
      .flatMap((d) => (d.isDirectory() ? walk(resolve(dir, d.name)) : [resolve(dir, d.name)]))
      .sort();
  const files1 = walk(out1);
  const files2 = walk(out2);
  assert.deepEqual(
    files1.map((f) => f.replace(out1, '')),
    files2.map((f) => f.replace(out2, '')),
  );
  for (let i = 0; i < files1.length; i++) {
    assert.equal(readFileSync(files1[i], 'utf8'), readFileSync(files2[i], 'utf8'), files1[i]);
  }
});

test('to-markdown：条目文件带 YAML 头与安装命令（与 02-data-model 镜像格式一致）', () => {
  const file = writeExport('ok.json', exportData);
  const out = resolve(tmp, 'out-format');
  run('to-markdown.mjs', [file, out]);
  const md = readFileSync(resolve(out, 'entries', 'tool', 'claude-code.md'), 'utf8');
  assert.match(md, /^---\n/);
  assert.match(md, /id: "/);
  assert.match(md, /## 安装（Windows 原生）/);
  assert.match(md, /irm https:\/\/claude\.ai\/install\.ps1/);
});
