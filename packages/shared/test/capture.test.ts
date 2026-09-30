import { describe, it, expect } from 'vitest';
import { captureToDraft } from '../src/capture.js';

describe('快速记录转换', () => {
  it('整段是 URL：标题取域名+路径，存为链接', () => {
    const d = captureToDraft({ type: 'mcp', text: 'https://github.com/microsoft/playwright-mcp/' });
    expect(d.title).toBe('github.com/microsoft/playwright-mcp');
    expect(d.links).toEqual([
      { label: '来源', url: 'https://github.com/microsoft/playwright-mcp/' },
    ]);
    expect(d.status).toBe('inbox');
    expect(d.body).toBe('');
  });
  it('短文本：标题取第一行前 60 字符', () => {
    const d = captureToDraft({ type: 'tool', text: '一个好用的工具' });
    expect(d.title).toBe('一个好用的工具');
    expect(d.snippets).toHaveLength(0);
    expect(d.body).toBe('');
  });
  it('长文本 + prompt：存成片段', () => {
    const text = '请帮我评审代码。' + 'x'.repeat(80);
    const d = captureToDraft({ type: 'prompt', text });
    expect(d.snippets).toHaveLength(1);
    expect(d.snippets[0].code).toBe(text);
    expect(d.body).toBe('');
  });
  it('长文本 + 非 prompt：存进笔记', () => {
    const text = '一段很长的说明。' + 'y'.repeat(80);
    const d = captureToDraft({ type: 'config', text });
    expect(d.body).toBe(text);
    expect(d.snippets).toHaveLength(0);
  });
  it('显式 sourceUrl 优先作为链接', () => {
    const d = captureToDraft({ type: 'tool', text: '某工具', sourceUrl: 'https://example.com/x' });
    expect(d.links).toEqual([{ label: '来源', url: 'https://example.com/x' }]);
  });
  it('生成合法 slug', () => {
    const d = captureToDraft({ type: 'tool', text: 'Some Tool Name' });
    expect(d.slug).toBe('some-tool-name');
  });
});
