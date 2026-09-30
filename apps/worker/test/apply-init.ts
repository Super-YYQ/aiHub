// 测试共用：在空测试库上执行 0001_init.sql（每个测试文件独立存储，都要自建表）。
import { env } from 'cloudflare:test';
import { INIT_SQL } from './init-sql';

let applied = false;

export async function applyInitSql() {
  if (applied) return;
  const stmts = INIT_SQL.split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  await env.DB.batch(stmts.map((sql) => env.DB.prepare(sql)));
  applied = true;
}
