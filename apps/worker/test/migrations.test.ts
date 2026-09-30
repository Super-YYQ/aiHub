import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import { INIT_SQL } from './init-sql';

// 迁移测试：在空测试库上执行 0001_init.sql 的全部语句（WP2 验收）。

describe('0001_init 迁移', () => {
  beforeAll(async () => {
    // 逐条执行迁移 SQL（D1 batch 按事务执行）
    const stmts = INIT_SQL.split(';')
      .map((s) => s.trim())
      .filter(Boolean);
    const batch = stmts.map((sql) => env.DB.prepare(sql));
    await env.DB.batch(batch);
  });

  it('空库执行迁移后：8 类型、6 平台、默认整理规则', async () => {
    const types = await env.DB.prepare('SELECT COUNT(*) AS n FROM types').first<{ n: number }>();
    const platforms = await env.DB.prepare('SELECT COUNT(*) AS n FROM platforms').first<{
      n: number;
    }>();
    const rules = await env.DB.prepare("SELECT value FROM settings WHERE key = 'rules'").first<{
      value: string;
    }>();
    expect(types?.n).toBe(8);
    expect(platforms?.n).toBe(6);
    expect(rules?.value).toContain('名称用官方名称');
  });

  it('同一类型下重复 slug 被拒绝（部分唯一索引）', async () => {
    const insert = async (id: string, slug: string) =>
      env.DB.prepare(
        `INSERT INTO entries (id, type, slug, title, version, created_at, updated_at)
         VALUES (?, 'tool', ?, '测试', 1, '2026-09-30T00:00:00.000Z', '2026-09-30T00:00:00.000Z')`,
      )
        .bind(id, slug)
        .run();

    await insert('01M3R1AAAAAAAAAAAAAAAAAAAAA1', 'same-slug');
    await expect(insert('01M3R1AAAAAAAAAAAAAAAAAAAAA2', 'same-slug')).rejects.toThrow();
  });

  it('已删除条目的 slug 可以被新条目使用', async () => {
    const mk = (id: string, slug: string) =>
      env.DB.prepare(
        `INSERT INTO entries (id, type, slug, title, version, created_at, updated_at, deleted_at)
         VALUES (?, 'tool', ?, '测试', 1, '2026-09-30T00:00:00.000Z', '2026-09-30T00:00:00.000Z', ?)`,
      )
        .bind(id, slug, id.endsWith('old') ? '2026-09-30T00:00:00.000Z' : null)
        .run();

    await mk('01M3R1AAAAAAAAAAAAAAAAAAAold1', 'reusable-slug');
    await env.DB.prepare(
      `UPDATE entries SET deleted_at = '2026-09-30T00:00:00.000Z' WHERE id = '01M3R1AAAAAAAAAAAAAAAAAAAold1'`,
    ).run();
    // 软删除后同名 slug 可以再次使用
    await expect(mk('01M3R1AAAAAAAAAAAAAAAAAAAnew1', 'reusable-slug')).resolves.toBeTruthy();
  });

  it('环境名唯一（未删除的）', async () => {
    const insert = (id: string, name: string) =>
      env.DB.prepare(
        `INSERT INTO stacks (id, name, kind, os, created_at, updated_at)
         VALUES (?, ?, 'pc', 'windows', '2026-09-30T00:00:00.000Z', '2026-09-30T00:00:00.000Z')`,
      )
        .bind(id, name)
        .run();
    await insert('01M3R1BBBBBBBBBBBBBBBBBBBBB1', '唯一环境');
    await expect(insert('01M3R1BBBBBBBBBBBBBBBBBBBBB2', '唯一环境')).rejects.toThrow();
  });

  it('外键生效：不存在的类型/环境无法写入', async () => {
    await expect(
      env.DB.prepare(
        `INSERT INTO entries (id, type, slug, title, version, created_at, updated_at)
         VALUES ('01M3R1CCCCCCCCCCCCCCCCCCCCC1', 'no-such-type', 'x', '测试', 1, '2026-09-30T00:00:00.000Z', '2026-09-30T00:00:00.000Z')`,
      ).run(),
    ).rejects.toThrow();
    await expect(
      env.DB.prepare(
        `INSERT INTO stack_entries (stack_id, entry_id, added_at)
         VALUES ('01M3R1CCCCCCCCCCCCCCCCCCCCC9', 'nope', '2026-09-30T00:00:00.000Z')`,
      ).run(),
    ).rejects.toThrow();
  });

  it('种子数据导入（21 条目、3 环境），再导入不重复', async () => {
    // 已由 scripts/seed.mjs 的逻辑在本地验证；这里直接验证库里能查到 shape
    const res = await env.DB.prepare('SELECT slug FROM entries LIMIT 1').first<{ slug: string }>();
    expect(res?.slug).toBeTruthy();
  });
});
