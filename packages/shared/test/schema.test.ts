import { describe, it, expect } from 'vitest';
import {
  entryDraftSchema,
  entrySchema,
  entryPatchSchema,
  captureSchema,
  typeWriteSchema,
  platformWriteSchema,
  stackWriteSchema,
  stackSchema,
  stackEntriesUpdateSchema,
  tagRenameSchema,
  proposalCreateSchema,
  importModeSchema,
  exportSchema,
} from '../src/schema.js';

const ULID = '01M3R0BSKXW6ZTBW0ZYH3G6M18';
const ULID2 = '01M3R0C20J7N99XYBXVSNM4AQG';

const validDraft = {
  type: 'tool',
  slug: 'some-tool',
  title: '某工具',
  summary: '一句话',
  status: 'using' as const,
  pinned: true,
  rating: 4,
  platforms: ['general'],
  tags: ['CLI', 'cli', ' 编码代理 ', ''],
  fields: { 类别: 'CLI' },
  snippets: [{ label: '安装', lang: 'bash', code: 'npm i x', install: true }],
  links: [{ label: '官网', url: 'https://example.com' }],
  body: '正文',
};

describe('entryDraftSchema', () => {
  it('通过：标签去重、去空白、补默认值', () => {
    const out = entryDraftSchema.parse(validDraft);
    expect(out.tags).toEqual(['CLI', '编码代理']);
    expect(out.summary).toBe('一句话');
    expect(out.pinned).toBe(true);
  });
  it('缺省字段取默认值', () => {
    const out = entryDraftSchema.parse({ type: 'tool', title: 'x' });
    expect(out.status).toBe('inbox');
    expect(out.rating).toBe(0);
    expect(out.snippets).toEqual([]);
    expect(out.fields).toEqual({});
  });
  // 每条约束一个失败用例
  it('失败：title 过长（>120）', () => {
    expect(entryDraftSchema.safeParse({ ...validDraft, title: 'x'.repeat(121) }).success).toBe(
      false,
    );
  });
  it('失败：title 为空', () => {
    expect(entryDraftSchema.safeParse({ ...validDraft, title: '' }).success).toBe(false);
  });
  it('失败：summary 过长（>280）', () => {
    expect(entryDraftSchema.safeParse({ ...validDraft, summary: 'x'.repeat(281) }).success).toBe(
      false,
    );
  });
  it('失败：rating 越界', () => {
    expect(entryDraftSchema.safeParse({ ...validDraft, rating: 6 }).success).toBe(false);
    expect(entryDraftSchema.safeParse({ ...validDraft, rating: -1 }).success).toBe(false);
  });
  it('失败：rating 非整数', () => {
    expect(entryDraftSchema.safeParse({ ...validDraft, rating: 2.5 }).success).toBe(false);
  });
  it('失败：status 非法', () => {
    expect(entryDraftSchema.safeParse({ ...validDraft, status: 'active' }).success).toBe(false);
  });
  it('失败：slug 非法（大写/横杠开头/过长）', () => {
    expect(entryDraftSchema.safeParse({ ...validDraft, slug: 'Bad' }).success).toBe(false);
    expect(entryDraftSchema.safeParse({ ...validDraft, slug: '-x' }).success).toBe(false);
    expect(entryDraftSchema.safeParse({ ...validDraft, slug: 'x'.repeat(65) }).success).toBe(false);
  });
  it('失败：type 非法（大写/过短）', () => {
    expect(entryDraftSchema.safeParse({ ...validDraft, type: 'Tool' }).success).toBe(false);
    expect(entryDraftSchema.safeParse({ ...validDraft, type: 'x' }).success).toBe(false);
  });
  it('失败：platforms 超过 10 个', () => {
    expect(
      entryDraftSchema.safeParse({
        ...validDraft,
        platforms: Array.from({ length: 11 }, (_, i) => `p${i}`),
      }).success,
    ).toBe(false);
  });
  it('失败：tags 超过 20 个', () => {
    expect(
      entryDraftSchema.safeParse({
        ...validDraft,
        tags: Array.from({ length: 21 }, (_, i) => `t${i}`),
      }).success,
    ).toBe(false);
  });
  it('失败：单个 tag 过长（>32）', () => {
    expect(entryDraftSchema.safeParse({ ...validDraft, tags: ['x'.repeat(33)] }).success).toBe(
      false,
    );
  });
  it('失败：fields 超 30 项', () => {
    const fields: Record<string, string> = {};
    for (let i = 0; i < 31; i++) fields[`k${i}`] = 'v';
    expect(entryDraftSchema.safeParse({ ...validDraft, fields }).success).toBe(false);
  });
  it('失败：fields 键过长（>32）', () => {
    const longKey: Record<string, string> = { ['x'.repeat(33)]: 'v' };
    expect(entryDraftSchema.safeParse({ ...validDraft, fields: longKey }).success).toBe(false);
  });
  it('失败：fields 值过长（>500）', () => {
    expect(
      entryDraftSchema.safeParse({ ...validDraft, fields: { k: 'x'.repeat(501) } }).success,
    ).toBe(false);
  });
  it('失败：snippets 超 20 个', () => {
    const snippets = Array.from({ length: 21 }, () => ({ code: 'x' }));
    expect(entryDraftSchema.safeParse({ ...validDraft, snippets }).success).toBe(false);
  });
  it('失败：snippet code 为空', () => {
    expect(entryDraftSchema.safeParse({ ...validDraft, snippets: [{ code: '' }] }).success).toBe(
      false,
    );
  });
  it('失败：snippet code 过长（>20000）', () => {
    expect(
      entryDraftSchema.safeParse({ ...validDraft, snippets: [{ code: 'x'.repeat(20001) }] })
        .success,
    ).toBe(false);
  });
  it('失败：snippet label 过长（>60）', () => {
    expect(
      entryDraftSchema.safeParse({
        ...validDraft,
        snippets: [{ code: 'x', label: 'x'.repeat(61) }],
      }).success,
    ).toBe(false);
  });
  it('失败：links 超 20 个', () => {
    const links = Array.from({ length: 21 }, () => ({ url: 'https://a.com' }));
    expect(entryDraftSchema.safeParse({ ...validDraft, links }).success).toBe(false);
  });
  it('失败：链接协议非 http(s)', () => {
    expect(
      entryDraftSchema.safeParse({ ...validDraft, links: [{ url: 'javascript:alert(1)' }] })
        .success,
    ).toBe(false);
    expect(
      entryDraftSchema.safeParse({ ...validDraft, links: [{ url: 'ftp://a.com' }] }).success,
    ).toBe(false);
  });
  it('失败：链接过长（>2000）', () => {
    expect(
      entryDraftSchema.safeParse({
        ...validDraft,
        links: [{ url: 'https://a.com/' + 'x'.repeat(2000) }],
      }).success,
    ).toBe(false);
  });
  it('失败：body 过长（>50000）', () => {
    expect(entryDraftSchema.safeParse({ ...validDraft, body: 'x'.repeat(50001) }).success).toBe(
      false,
    );
  });
  it('失败：id 非 ULID', () => {
    expect(entryDraftSchema.safeParse({ ...validDraft, id: 'abc' }).success).toBe(false);
  });
});

describe('entrySchema（完整条目）', () => {
  it('通过', () => {
    const out = entrySchema.parse({
      ...validDraft,
      id: ULID,
      snippets: [{ id: 'abc12345', ...validDraft.snippets[0] }],
      stacks: [{ id: ULID2, note: '' }],
      version: 3,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-02T00:00:00.000Z',
    });
    expect(out.version).toBe(3);
    expect(out.deletedAt).toBeNull();
  });
  it('失败：version 从 0 开始', () => {
    expect(
      entrySchema.safeParse({
        ...validDraft,
        id: ULID,
        snippets: [],
        stacks: [],
        version: 0,
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      }).success,
    ).toBe(false);
  });
});

describe('entryPatchSchema', () => {
  it('只改 status/pinned/rating', () => {
    expect(entryPatchSchema.parse({ status: 'inbox' }).status).toBe('inbox');
    expect(entryPatchSchema.parse({ pinned: true }).pinned).toBe(true);
    expect(entryPatchSchema.parse({ rating: 2 }).rating).toBe(2);
  });
  it('空对象失败', () => {
    expect(entryPatchSchema.safeParse({}).success).toBe(false);
  });
});

describe('captureSchema', () => {
  it('通过', () => expect(captureSchema.parse({ type: 'mcp', text: 'x' }).text).toBe('x'));
  it('失败：text 为空', () => {
    expect(captureSchema.safeParse({ type: 'mcp', text: '' }).success).toBe(false);
  });
  it('失败：sourceUrl 非 http', () =>
    expect(captureSchema.safeParse({ type: 'mcp', text: 'x', sourceUrl: 'ftp://a' }).success).toBe(
      false,
    ));
});

describe('字典与环境 schema', () => {
  it('typeWriteSchema：名称 1–20、颜色 #RRGGBB', () => {
    expect(
      typeWriteSchema.parse({ name: '新类型', color: '#2f6db5', fieldTemplate: ['a'], sort: 9 })
        .name,
    ).toBe('新类型');
    expect(typeWriteSchema.safeParse({ name: '', color: '#2f6db5' }).success).toBe(false);
    expect(typeWriteSchema.safeParse({ name: 'x'.repeat(21), color: '#2f6db5' }).success).toBe(
      false,
    );
    expect(typeWriteSchema.safeParse({ name: 'x', color: 'red' }).success).toBe(false);
    expect(typeWriteSchema.safeParse({ name: 'x', color: '#GGGGGG' }).success).toBe(false);
  });
  it('platformWriteSchema', () => {
    expect(platformWriteSchema.parse({ name: '新平台' }).sort).toBe(0);
    expect(platformWriteSchema.safeParse({ name: '' }).success).toBe(false);
  });
  it('stackWriteSchema：kind/os 枚举、说明 ≤280', () => {
    const out = stackWriteSchema.parse({
      name: '公司电脑',
      kind: 'pc',
      os: 'windows',
      description: 'd',
    });
    expect(out.kind).toBe('pc');
    expect(stackWriteSchema.safeParse({ name: 'x', kind: 'laptop', os: 'windows' }).success).toBe(
      false,
    );
    expect(
      stackWriteSchema.safeParse({ name: 'x'.repeat(41), kind: 'pc', os: 'any' }).success,
    ).toBe(false);
    expect(
      stackWriteSchema.safeParse({ name: 'x', kind: 'pc', os: 'any', description: 'x'.repeat(281) })
        .success,
    ).toBe(false);
  });
  it('stackSchema：ULID + ISO 时间', () => {
    expect(() =>
      stackSchema.parse({
        id: ULID,
        name: 'x',
        kind: 'pc',
        os: 'any',
        description: '',
        sort: 0,
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      }),
    ).not.toThrow();
    expect(
      stackSchema.safeParse({
        id: 'zz',
        name: 'x',
        kind: 'pc',
        os: 'any',
        createdAt: '2026-09-01',
        updatedAt: '2026-09-01',
      }).success,
    ).toBe(false);
  });
  it('stackEntriesUpdateSchema', () => {
    const out = stackEntriesUpdateSchema.parse({ add: [{ entryId: ULID }], remove: [ULID2] });
    expect(out.add[0].note).toBe('');
  });
});

describe('其他 schema', () => {
  it('tagRenameSchema', () => {
    expect(tagRenameSchema.parse({ from: ' a ', to: 'b' }).from).toBe('a');
    expect(tagRenameSchema.safeParse({ from: '', to: 'b' }).success).toBe(false);
  });
  it('importModeSchema', () => {
    expect(importModeSchema.parse('replace')).toBe('replace');
    expect(importModeSchema.safeParse('other').success).toBe(false);
  });
  it('proposalCreateSchema：四种 kind 的形状校验', () => {
    expect(proposalCreateSchema.parse({ kind: 'create', draft: validDraft }).kind).toBe('create');
    expect(() =>
      proposalCreateSchema.parse({
        kind: 'update',
        targetId: ULID,
        baseVersion: 1,
        draft: validDraft,
      }),
    ).not.toThrow();
    expect(() =>
      proposalCreateSchema.parse({ kind: 'archive', targetId: ULID, draft: validDraft }),
    ).not.toThrow();
    expect(() =>
      proposalCreateSchema.parse({
        kind: 'merge',
        targetId: ULID,
        draft: validDraft,
        mergeIds: [ULID2],
      }),
    ).not.toThrow();
    expect(proposalCreateSchema.safeParse({ kind: 'create' }).success).toBe(false); // 缺 draft
    expect(proposalCreateSchema.safeParse({ kind: 'update', draft: validDraft }).success).toBe(
      false,
    ); // 缺 targetId
    expect(proposalCreateSchema.safeParse({ kind: 'merge', draft: validDraft }).success).toBe(
      false,
    ); // 缺 mergeIds
  });
  it('exportSchema 骨架', () => {
    expect(
      exportSchema.parse({
        schemaVersion: 1,
        exportedAt: '2026-09-29T19:17:00.000Z',
        types: [],
        platforms: [],
        stacks: [],
        entries: [],
        settings: { rules: '' },
      }).schemaVersion,
    ).toBe(1);
  });
});
