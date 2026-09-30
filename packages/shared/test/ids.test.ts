import { describe, it, expect } from 'vitest';
import { ulid, isUlid, isValidSlug, slugify, snippetId } from '../src/ids.js';

describe('ulid', () => {
  it('生成 26 位 Crockford Base32', () => {
    const id = ulid();
    expect(id).toHaveLength(26);
    expect(isUlid(id)).toBe(true);
  });
  it('时间前缀单调不减', () => {
    const a = ulid(1000);
    const b = ulid(2000);
    expect(a.slice(0, 10) <= b.slice(0, 10)).toBe(true);
  });
  it('isUlid 拒绝非法值', () => {
    expect(isUlid('too-short')).toBe(false);
    expect(isUlid('I'.repeat(26))).toBe(false); // I 不在字母表
    expect(isUlid(123)).toBe(false);
  });
});

describe('slug', () => {
  it('接受合法 slug（含汉字）', () => {
    expect(isValidSlug('claude-code')).toBe(true);
    expect(isValidSlug('工具-1')).toBe(true);
    expect(isValidSlug('a')).toBe(true);
  });
  it('拒绝非法 slug', () => {
    expect(isValidSlug('-lead')).toBe(false);
    expect(isValidSlug('trail-')).toBe(false);
    expect(isValidSlug('Upper')).toBe(false);
    expect(isValidSlug('has space')).toBe(false);
    expect(isValidSlug('a'.repeat(65))).toBe(false);
    expect(isValidSlug('')).toBe(false);
  });
  it('slugify 归一化并回退', () => {
    expect(slugify('Claude Code!!')).toBe('claude-code');
    expect(slugify('  多个   空格 ')).toBe('多个-空格');
    expect(slugify('***')).toBe('item');
    expect(isValidSlug(slugify('Some Title'))).toBe(true);
  });
});

describe('snippetId', () => {
  it('8 位小写', () => {
    const id = snippetId();
    expect(id).toMatch(/^[0-9a-z]{8}$/);
  });
});
