// E2E 用的 wrangler dev 启动器：本地 D1（迁移 + 重置 + 种子）+ wrangler.dev.jsonc（development + DEV_AUTH_EMAIL）。
// 从 web 目录运行：node ../worker/scripts/dev-e2e.mjs（playwright.config 的 webServer）。
import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const workerDir = resolve(here, '..');

// 确保前端 dist 存在（wrangler assets 需要）
const webDist = resolve(workerDir, '../web/dist');
if (!existsSync(webDist)) mkdirSync(webDist, { recursive: true });
if (!existsSync(resolve(webDist, 'index.html'))) {
  writeFileSync(resolve(webDist, 'index.html'), '<!doctype html><title>AI 工作台（占位）</title>');
}

// 本地迁移（已应用时命令自行处理）
try {
  execSync('pnpm exec wrangler d1 migrations apply ai-kit --local --config wrangler.dev.jsonc', {
    cwd: workerDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
} catch {
  /* 已应用 → 忽略 */
}

// E2E 需要确定性的初始状态：清空业务表（并补回字典的变更日志）后重新导入种子。
// 只影响本地 wrangler 的 sqlite，不碰任何远程数据。
for (const cmd of [
  'pnpm exec wrangler d1 execute ai-kit --local --config wrangler.dev.jsonc --file scripts/e2e-reset.sql',
  'node scripts/seed.mjs',
]) {
  try {
    execSync(cmd, { cwd: workerDir, stdio: 'inherit', shell: process.platform === 'win32' });
  } catch {
    /* 表尚未建好 → 迁移没跑成时后续运行处理 */
  }
}

const child = spawn(
  'pnpm',
  ['exec', 'wrangler', 'dev', '--port', '8787', '--config', 'wrangler.dev.jsonc'],
  { cwd: workerDir, stdio: 'inherit', shell: process.platform === 'win32' },
);

const shutdown = () => {
  child.kill();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
