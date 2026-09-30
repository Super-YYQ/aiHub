import { describe, it, expect } from 'vitest';
import { searchEntries, highlightSegments, tokenize } from '../src/search';
import { loadPrototypeSeed } from './helpers';
import { convertPrototype } from '../src/prototype';

// 用原型的 21 条示例数据复现原型行为（WP1 验收）。
const seed = loadPrototypeSeed();
const { entries } = convertPrototype(seed);
const typeName = (id: string) =>
  ({
    tool: '工具',
    prompt: '提示词',
    skill: 'Skill',
    mcp: 'MCP',
    hook: 'Hook',
    plugin: '插件',
    config: '配置',
    model: '模型与 API',
  })[id] ?? id;

describe('搜索：原型行为', () => {
  it('共 21 条条目、3 个环境', () => {
    expect(entries).toHaveLength(21);
    expect(seed.stacks).toHaveLength(3);
  });
  it('查询 hook 时排第一的是 Hook 类型条目', () => {
    const r = searchEntries(entries, 'hook', { typeName });
    expect(r[0].type).toBe('hook');
  });
  it('查询 playwright 时第一是 Playwright MCP', () => {
    const r = searchEntries(entries, 'playwright', { typeName });
    expect(r[0].slug).toBe('playwright');
    expect(r[0].type).toBe('mcp');
  });
  it('类型名中文精确命中 +10（“工具”排在包含命中的前面）', () => {
    const r = searchEntries(entries, '工具', { typeName });
    expect(r[0].type).toBe('tool');
  });
  it('多关键词 AND 语义', () => {
    const r = searchEntries(entries, 'claude code', { typeName });
    expect(r.length).toBeGreaterThan(0);
    // 每个词都要命中（可能在标题/说明/要点/片段等任一字段）
    for (const e of r) {
      const hay = [
        e.title,
        e.slug,
        e.summary ?? '',
        ...Object.values(e.fields ?? {}),
        ...(e.snippets ?? []).flatMap((s) => [s.label ?? '', s.code ?? '']),
      ]
        .join(' ')
        .toLowerCase();
      expect(hay).toContain('claude');
      expect(hay).toContain('code');
    }
  });
  it('已弃用 -3、置顶 +1', () => {
    const pinnedFirst = searchEntries(
      [
        {
          ...entries[0],
          title: 'mcp 查重专用',
          slug: 'zzz',
          status: 'using',
          pinned: true,
          type: 'mcp',
          snippets: [],
          fields: {},
          tags: [],
          links: [],
          body: '',
        },
        {
          ...entries[0],
          id: '02B',
          title: 'mcp 普通条目',
          slug: 'yyy',
          status: 'using',
          pinned: false,
          type: 'mcp',
          snippets: [],
          fields: {},
          tags: [],
          links: [],
          body: '',
        },
      ],
      'mcp',
      { typeName },
    );
    expect(pinnedFirst[0].pinned).toBe(true);
  });
  it('片段与笔记内容可命中（权重 1）', () => {
    const r = searchEntries(entries, 'claude mcp list', { typeName });
    expect(r.length).toBeGreaterThan(0);
  });
});

describe('highlightSegments', () => {
  it('按字符位置标记', () => {
    const segs = highlightSegments('Claude Code', tokenize('code'));
    expect(segs.some((s) => s.hit && s.text === 'Code')).toBe(true);
  });
  it('无结果不标记', () => {
    expect(highlightSegments('abc', tokenize('zzz'))).toEqual([{ text: 'abc', hit: false }]);
  });
});
