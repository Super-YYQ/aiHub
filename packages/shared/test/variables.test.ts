import { describe, it, expect } from 'vitest';
import { parseVariables, applyVariables } from '../src/variables';

describe('变量解析与替换', () => {
  it('解析去重、去空白、保持顺序', () => {
    expect(parseVariables('你好 {{ 名字 }}，语言 {{语言}}，再看 {{名字}}')).toEqual([
      '名字',
      '语言',
    ]);
  });
  it('无变量返回空', () => {
    expect(parseVariables('没有变量')).toEqual([]);
  });
  it('替换已填写、保留未填写', () => {
    const code = '评审 {{语言}} 代码，关注 {{关注点}}';
    expect(applyVariables(code, { 语言: 'TypeScript' })).toBe(
      '评审 TypeScript 代码，关注 {{关注点}}',
    );
  });
  it('空值视为未填写', () => {
    expect(applyVariables('值={{x}}', { x: '' })).toBe('值={{x}}');
  });
  it('带空白的变量名也能替换', () => {
    expect(applyVariables('{{ x }}', { x: 'ok' })).toBe('ok');
  });
});
