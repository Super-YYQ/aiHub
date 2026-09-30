import { SELF } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { devBypassEnabled } from '../src/auth/middleware';
import { applyInitSql } from './apply-init';
import jwks from './fixtures/jwks.json';
import tokens from './fixtures/tokens.json';

// WP3 鉴权中间件测试（05-security#jwt-校验 的验收标准）。
// 签名密钥与各角色令牌见 test/fixtures/（generate.mjs 生成，全部是测试专用假凭据）。
// JWKS 请求（createRemoteJWKSet 抓 /cdn-cgi/access/certs）通过覆盖全局 fetch 模拟：
// 测试与被测 Worker 在同一 isolate，全局 mock 对两者都生效。

const T = tokens.tokens;
const JWKS_URL = `${tokens.team}/cdn-cgi/access/certs`;
const originalFetch = globalThis.fetch;

beforeAll(async () => {
  await applyInitSql();
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url === JWKS_URL) {
      return new Response(JSON.stringify(jwks), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});
const auth = (token?: string) =>
  token ? { 'Cf-Access-Jwt-Assertion': token } : ({} as Record<string, string>);

async function get(path: string, token?: string) {
  return await SELF.fetch(`http://localhost${path}`, { headers: auth(token) });
}

describe('JWT 校验', () => {
  it('缺少 JWT → 401 unauthenticated', async () => {
    const res = await get('/api/me');
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('unauthenticated');
  });

  it('ENVIRONMENT=production 时，设置 DEV_AUTH_EMAIL 也不会跳过校验', async () => {
    // devBypassEnabled 是中间件使用的唯一旁路判据
    expect(devBypassEnabled({ ENVIRONMENT: 'production', DEV_AUTH_EMAIL: 'x@y.z' })).toBe(false);
    expect(devBypassEnabled({ ENVIRONMENT: 'development' })).toBe(false);
    expect(devBypassEnabled({ ENVIRONMENT: 'development', DEV_AUTH_EMAIL: 'x@y.z' })).toBe(true);
    // 测试池的 ENVIRONMENT=production：无 token 一律 401（上面第一个用例已覆盖）
  });

  it('有效 owner JWT → 200，/api/me 返回身份', async () => {
    const res = await get('/api/me', T.owner);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { kind: string; email: string; role: string };
    expect(body).toEqual({ kind: 'human', email: 'owner@example.com', role: 'owner' });
  });

  it('已过期 → 401', async () => {
    const res = await get('/api/me', T.expired);
    expect(res.status).toBe(401);
  });

  it('aud 不符 → 401', async () => {
    const res = await get('/api/me', T.wrongAud);
    expect(res.status).toBe(401);
  });

  it('签名错误（乱改 token）→ 401', async () => {
    const tampered = `${T.owner.slice(0, -6)}AAAAAA`;
    const res = await get('/api/me', tampered);
    expect(res.status).toBe(401);
  });

  it('邮箱不在白名单 → 403', async () => {
    const res = await get('/api/me', T.otherEmail);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('forbidden');
  });

  it('没有 email 也没有服务标识 → 403', async () => {
    const res = await get('/api/me', T.noEmailNoCn);
    expect(res.status).toBe(403);
  });

  it('未登记的服务令牌 → 403', async () => {
    const res = await get('/api/me', T.unknownService);
    expect(res.status).toBe(403);
  });
});

describe('角色映射与按路由权限', () => {
  it('服务令牌映射出正确角色', async () => {
    for (const [name, role] of [
      ['agent', 'agent'],
      ['capture', 'capture'],
      ['backup', 'backup'],
    ] as const) {
      const res = await get('/api/me', T[name]);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { kind: string; role: string; email: string | null };
      expect(body.role).toBe(role);
      expect(body.kind).toBe('service');
      expect(body.email).toBeNull();
    }
  });

  it('表外接口按角色拒绝：backup 调 POST /api/capture → 403', async () => {
    const res = await SELF.fetch('http://localhost/api/capture', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth(T.backup) },
      body: JSON.stringify({ type: 'tool', text: 'x' }),
    });
    expect(res.status).toBe(403);
  });

  it('capture 角色只能调 POST /api/capture', async () => {
    const ok = await SELF.fetch('http://localhost/api/capture', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth(T.capture) },
      body: JSON.stringify({ type: 'tool', text: 'x' }),
    });
    // WP5 已实现：capture 直接成功
    expect(ok.status).toBe(201);

    const denied = await get('/api/entries', T.capture);
    expect(denied.status).toBe(403);
  });

  it('agent 只读：GET /api/entries 过，POST /api/entries 拒', async () => {
    const read = await get('/api/entries', T.agent);
    expect(read.status).toBe(200); // 空档案也返回 200（WP4 已实现）
    const write = await SELF.fetch('http://localhost/api/entries', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth(T.agent) },
      body: '{}',
    });
    expect(write.status).toBe(403);
  });

  it('backup 只能 GET /api/export', async () => {
    const allowed = await get('/api/export', T.backup);
    expect(allowed.status).toBe(200); // WP5 已实现
    const denied = await get('/api/entries', T.backup);
    expect(denied.status).toBe(403);
  });
});
