import { describe, it, expect } from 'vitest';
import { convertPrototype } from '../src/prototype.js';
import { loadPrototypeSeed } from './helpers';
import { entryDraftSchema, stackSchema, entrySchema } from '../src/schema.js';
import { isUlid } from '../src/ids.js';

const seed = loadPrototypeSeed();

describe('原型数据转换（WP1/WP2 验收：21 条目、3 环境）', () => {
  const { stacks, entries } = convertPrototype(seed);

  it('数量正确、ID 重新生成为 ULID', () => {
    expect(entries).toHaveLength(21);
    expect(stacks).toHaveLength(3);
    for (const s of stacks) expect(isUlid(s.id)).toBe(true);
    for (const e of entries) expect(isUlid(e.id)).toBe(true);
  });
  it('desc 改名 description', () => {
    expect(stacks[0].description).toContain('Windows 11');
  });
  it('日期补成 ISO（当天 00:00:00.000Z）', () => {
    expect(entries[0].createdAt).toBe('2026-03-02T00:00:00.000Z');
    expect(entries[0].updatedAt).toBe('2026-09-26T00:00:00.000Z');
  });
  it('stacks 数组转成成员关系', () => {
    const claude = entries.find((e) => e.slug === 'claude-code')!;
    expect(claude.stacks).toHaveLength(2);
    const names = claude.stacks.map((r) => stacks.find((s) => s.id === r.id)?.name);
    expect(names).toContain('主力 Windows 工作站');
    expect(names).toContain('Oracle 2C2G 服务器');
  });
  it('转换结果能通过服务端 schema（环境）', () => {
    for (const s of stacks) expect(() => stackSchema.parse(s)).not.toThrow();
  });
  it('转换结果是合法的导入数据（条目 draft + 完整 schema 默认值兼容）', () => {
    for (const e of entries) {
      const { stacks: _s, ...rest } = e;
      const parsed = entryDraftSchema.parse({
        ...rest,
        snippets: e.snippets.map((sn) => ({
          label: sn.label,
          lang: sn.lang,
          code: sn.code,
          install: sn.install,
        })),
      });
      expect(parsed.title).toBe(e.title);
    }
  });
  it('片段获得稳定 id', () => {
    const claude = entries.find((e) => e.slug === 'claude-code')!;
    expect(claude.snippets.length).toBeGreaterThan(0);
    for (const sn of claude.snippets) expect(sn.id).toMatch(/^[0-9a-z]{8}$/);
  });
  it('inbox 条目保持原型的字段值', () => {
    const inbox = entries.find((e) => e.slug === 'obsidian-mcp')!;
    expect(inbox.status).toBe('inbox');
    expect(inbox.summary).toBe('还没看，先记下来。');
    expect(inbox.snippets).toEqual([]);
  });
  it('完整条目可通过 entrySchema（补齐 version/时间）', () => {
    const e = entries[0];
    expect(() => entrySchema.parse({ ...e, version: 1, deletedAt: null })).not.toThrow();
  });
});
