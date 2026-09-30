import { describe, it, expect } from 'vitest';
import { scanText, scanEntry, isPlaceholder } from '../src/secret-scan.js';

// 假密钥：形状能命中规则，但都是明显的占位重复串，仅供测试扫描器。
const FAKE = {
  anthropic: 'sk-ant-' + 'A'.repeat(28),
  openai: 'sk-' + 'B'.repeat(28),
  openaiProj: 'sk-proj-' + 'B'.repeat(24),
  githubP: 'ghp_' + 'c'.repeat(36),
  githubPat: 'github_pat_' + 'd'.repeat(24),
  aws: 'AKIA' + 'ABCDEFGHIJKLMNOP',
  google: 'AIza' + 'e'.repeat(35),
  slack: 'xoxb-' + '1234567890abcd',
  privateKey: '-----BEGIN OPENSSH PRIVATE KEY-----',
  jwt: 'eyJ' + 'a'.repeat(12) + '.' + 'b'.repeat(12) + '.' + 'c'.repeat(12),
  assignment: 'api_key = "abcdefghijklmnop"',
};

const ruleHit = (text: string, ruleId: string) => scanText(text).some((f) => f.ruleId === ruleId);

describe('密钥扫描：每条规则的正例', () => {
  it('anthropic-key', () => expect(ruleHit(FAKE.anthropic, 'anthropic-key')).toBe(true));
  it('openai-key', () => {
    expect(ruleHit(FAKE.openai, 'openai-key')).toBe(true);
    expect(ruleHit(FAKE.openaiProj, 'openai-key')).toBe(true);
  });
  it('github-token', () => {
    expect(ruleHit(FAKE.githubP, 'github-token')).toBe(true);
    expect(ruleHit(FAKE.githubPat, 'github-token')).toBe(true);
  });
  it('aws-access-key', () => expect(ruleHit(FAKE.aws, 'aws-access-key')).toBe(true));
  it('google-api-key', () => expect(ruleHit(FAKE.google, 'google-api-key')).toBe(true));
  it('slack-token', () => expect(ruleHit(FAKE.slack, 'slack-token')).toBe(true));
  it('private-key', () => expect(ruleHit(FAKE.privateKey, 'private-key')).toBe(true));
  it('jwt', () => expect(ruleHit(FAKE.jwt, 'jwt')).toBe(true));
  it('assignment', () => expect(ruleHit(FAKE.assignment, 'assignment')).toBe(true));
});

describe('密钥扫描：占位符反例（全部写法）', () => {
  const placeholders = [
    'api_key = "${ANTHROPIC_API_KEY}"',
    'token=$MY_TOKEN',
    'secret: <your-secret-here>',
    'password = "YOUR_TOKEN_VALUE"',
    'key = "************"',
  ];
  for (const text of placeholders) {
    it(`不命中：${text}`, () => expect(scanText(text)).toHaveLength(0));
  }
  it('isPlaceholder 覆盖五种写法', () => {
    expect(isPlaceholder('${VAR}')).toBe(true);
    expect(isPlaceholder('$VAR')).toBe(true);
    expect(isPlaceholder('<your-token>')).toBe(true);
    expect(isPlaceholder('YOUR_TOKEN')).toBe(true);
    expect(isPlaceholder('******')).toBe(true);
    expect(isPlaceholder('realtoken123456')).toBe(false);
  });
});

describe('密钥扫描：脱敏预览与条目扫描', () => {
  it('预览为前 4 + … + 后 4', () => {
    const [f] = scanText(FAKE.google);
    expect(f.preview).toBe(`AIza…${'e'.repeat(35).slice(-4)}`);
    expect(f.preview).not.toContain(FAKE.google);
  });
  it('scanEntry 报告字段路径', () => {
    const findings = scanEntry({ title: '正常', body: FAKE.anthropic, fields: { 密钥: FAKE.aws } });
    const paths = findings.map((f) => f.path);
    expect(paths).toContain('body');
    expect(paths).toContain('fields.密钥');
  });
  it('干净文本不命中', () => {
    expect(scanText('这是一段正常的说明，没有密钥。')).toHaveLength(0);
  });
});
