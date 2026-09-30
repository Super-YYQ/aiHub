import { describe, it, expect } from 'vitest';
import { serializeEntry, fenceFor } from '../src/markdown.js';

const base = {
  id: '01ARZ0N1K4J4P7Q9M5F8D2T3AB',
  type: 'tool',
  title: '示例工具',
  status: 'using',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-02T00:00:00.000Z',
};

describe('fenceFor', () => {
  it('无反引号 → 3 个', () => expect(fenceFor('echo hi')).toBe('```'));
  it('含 3 个反引号 → 4 个', () => expect(fenceFor('x ``` y')).toBe('````'));
  it('含 5 个 → 6 个', () => expect(fenceFor('`````')).toBe('``````'));
});

describe('serializeEntry', () => {
  it('确定性：同输入两次输出逐字节相同', () => {
    const e = {
      ...base,
      snippets: [{ label: '安装', lang: 'bash', code: 'npm i x', install: true }],
      fields: { 类别: 'CLI' },
      links: [{ label: '官网', url: 'https://example.com' }],
      summary: '一句话',
      body: '## 标题\n\n正文',
      tags: ['a'],
      platforms: ['general'],
      rating: 3,
      pinned: true,
    };
    expect(serializeEntry(e)).toBe(serializeEntry(e));
  });
  it('YAML 头键序固定、字符串用 JSON 双引号', () => {
    const out = serializeEntry(
      { ...base, stacks: [{ id: '01M3R0BSKXW6ZTBW0ZYH3G6M18', note: '' }] },
      { stackName: () => '主力电脑' },
    );
    const head = out.split('\n').slice(0, 13).join('\n');
    expect(head).toContain('id: "01ARZ0N1K4J4P7Q9M5F8D2T3AB"');
    expect(head).toContain('type: "tool"');
    expect(head).toContain('title: "示例工具"');
    expect(head).toContain('status: "using"');
    expect(head).toContain('stacks: ["主力电脑"]');
    expect(head.indexOf('id:')).toBeLessThan(head.indexOf('type:'));
    expect(head.indexOf('type:')).toBeLessThan(head.indexOf('title:'));
    expect(head.indexOf('title:')).toBeLessThan(head.indexOf('status:'));
    expect(head.indexOf('status:')).toBeLessThan(head.indexOf('pinned:'));
    expect(head.indexOf('pinned:')).toBeLessThan(head.indexOf('rating:'));
    expect(head.indexOf('rating:')).toBeLessThan(head.indexOf('platforms:'));
    expect(head.indexOf('platforms:')).toBeLessThan(head.indexOf('tags:'));
    expect(head.indexOf('tags:')).toBeLessThan(head.indexOf('stacks:'));
    expect(head.indexOf('stacks:')).toBeLessThan(head.indexOf('created:'));
    expect(head.indexOf('created:')).toBeLessThan(head.indexOf('updated:'));
  });
  it('片段标题后加（安装），围栏自动加长', () => {
    const out = serializeEntry({
      ...base,
      snippets: [
        { label: '片段A', lang: 'bash', code: 'echo ``` ', install: true },
        { label: '', lang: '', code: 'x', install: false },
      ],
    });
    expect(out).toContain('## 片段A（安装）');
    expect(out).toContain('````bash'); // 围栏加长
    expect(out).toContain('## 片段');
  });
  it('正文顺序：说明→片段→笔记→链接', () => {
    const out = serializeEntry({
      ...base,
      summary: '说明文字',
      snippets: [{ code: 'cmd' }],
      body: '笔记内容',
      links: [{ label: '链接', url: 'https://e.com' }],
    });
    expect(out.indexOf('说明文字')).toBeLessThan(out.indexOf('## 片段'));
    expect(out.indexOf('## 片段')).toBeLessThan(out.indexOf('笔记内容'));
    expect(out.indexOf('笔记内容')).toBeLessThan(out.indexOf('## 链接'));
  });
  it('要点写成嵌套键值', () => {
    const out = serializeEntry({ ...base, fields: { 类别: 'CLI', 费用: '免费' } });
    expect(out).toContain('fields:');
    expect(out).toContain('  "类别": "CLI"');
  });
});
