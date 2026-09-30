import { SELF, env } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { applyInitSql } from './apply-init';
import jwks from './fixtures/jwks.json';
import tokens from './fixtures/tokens.json';
import seed from '../seed/seed.json';

// WP5 验收：同步与导出一致、幂等、replace 往返、prototype 导入。

const T = tokens.tokens;
const originalFetch = globalThis.fetch;
const OWNER = { 'Cf-Access-Jwt-Assertion': T.owner };

beforeAll(async () => {
  await applyInitSql();
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url === `${tokens.team}/cdn-cgi/access/certs`) {
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

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

async function seedViaImport(mode: string, body: unknown) {
  const res = await SELF.fetch(`http://localhost/api/import?mode=${mode}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...OWNER },
    body: JSON.stringify(body),
  });
  return res;
}

describe('prototype 模式导入', () => {
  it('导入原型数据得到 21 条条目、3 个环境', async () => {
    const res = await seedViaImport('prototype', seed);
    expect(res.status).toBe(200);
    const { imported } = await json<{ imported: number }>(res);
    expect(imported).toBe(21);
    const stacks = await json<unknown[]>(
      await SELF.fetch('http://localhost/api/stacks', { headers: OWNER }),
    );
    expect(stacks).toHaveLength(3);
  });
});

describe('同步接口', () => {
  it('从 since=0 反复同步直到 hasMore=false，数据与 /api/export 一致', async () => {
    // 拉全量
    const collected: Record<string, Map<string, unknown>> = {
      entries: new Map(),
      stacks: new Map(),
      types: new Map(),
      platforms: new Map(),
    };
    const deletedIds = new Set<string>();
    let since = 0;
    for (;;) {
      const page = await json<{
        entries: Array<{ id: string }>;
        stacks: Array<{ id: string }>;
        types: Array<{ id: string }>;
        platforms: Array<{ id: string }>;
        deleted: { entries: string[] };
        cursor: number;
        hasMore: boolean;
      }>(await SELF.fetch(`http://localhost/api/sync?since=${since}`, { headers: OWNER }));
      for (const e of page.entries) collected.entries.set(e.id, e);
      for (const s of page.stacks) collected.stacks.set(s.id, s);
      for (const t of page.types) collected.types.set(t.id, t);
      for (const p of page.platforms) collected.platforms.set(p.id, p);
      for (const d of page.deleted.entries) deletedIds.add(d);
      since = page.cursor;
      if (!page.hasMore) break;
    }
    expect(collected.entries.size).toBe(21);

    // 与导出一致：ID 集合完全相同
    const exported = await json<{
      entries: Array<{ id: string }>;
    }>(await SELF.fetch('http://localhost/api/export', { headers: OWNER }));
    const exportedIds = exported.entries.map((x) => x.id).sort();
    const syncedIds = [...collected.entries.keys()].sort();
    expect(syncedIds).toEqual(exportedIds);
    expect(exported.entries.length).toBe(21);
  });

  it('写入后能在下一次增量同步拿到；删除以 ID 出现', async () => {
    const before = await json<{ cursor: number }>(
      await SELF.fetch(`http://localhost/api/sync?since=0&limit=1`, { headers: OWNER }),
    );
    // 新建一条
    const created = await json<{ id: string }>(
      await SELF.fetch('http://localhost/api/entries', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...OWNER },
        body: JSON.stringify({ type: 'tool', slug: 'sync-demo', title: '同步演示' }),
      }),
    );
    // 找到包含它的增量页
    let found = false;
    let deletedSeen = false;
    let since = before.cursor;
    for (let i = 0; i < 10 && !(found && deletedSeen); i++) {
      const page = await json<{
        entries: Array<{ id: string }>;
        deleted: { entries: string[] };
        cursor: number;
        hasMore: boolean;
      }>(await SELF.fetch(`http://localhost/api/sync?since=${since}`, { headers: OWNER }));
      if (page.entries.some((e) => e.id === created.id)) found = true;
      since = page.cursor;
      if (!page.hasMore) break;
    }
    expect(found).toBe(true);

    // 删除它
    await SELF.fetch(`http://localhost/api/entries/${created.id}`, {
      method: 'DELETE',
      headers: { 'If-Match': '"1"', ...OWNER },
    });
    for (let i = 0; i < 10 && !deletedSeen; i++) {
      const page = await json<{ deleted: { entries: string[] }; cursor: number; hasMore: boolean }>(
        await SELF.fetch(`http://localhost/api/sync?since=${since}`, { headers: OWNER }),
      );
      if (page.deleted.entries.includes(created.id)) deletedSeen = true;
      since = page.cursor;
      if (!page.hasMore) break;
    }
    expect(deletedSeen).toBe(true);
  });
});

describe('快速记录幂等', () => {
  it('同一个 Idempotency-Key 提交两次：只生成一条条目，两次响应相同', async () => {
    const key = '01M3R1IDEMPOTENCYTEST000000A';
    const body = JSON.stringify({ type: 'mcp', text: 'https://example.com/some-tool' });
    const first = await SELF.fetch('http://localhost/api/capture', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': key, ...OWNER },
      body,
    });
    const second = await SELF.fetch('http://localhost/api/capture', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': key, ...OWNER },
      body,
    });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const firstBody = await json<{ id: string; title: string; status: string }>(first);
    const secondBody = await json<{ id: string; title: string; status: string }>(second);
    expect(secondBody.id).toBe(firstBody.id);
    expect(secondBody.title).toBe(firstBody.title);

    // 库里只有一条
    const rows = await env.DB.prepare(`SELECT COUNT(*) AS n FROM entries WHERE title = ?`)
      .bind(firstBody.title)
      .first<{ n: number }>();
    expect(rows?.n).toBe(1);
    expect(firstBody.status).toBe('inbox');
  });
});

describe('导出 → replace 导入 → 再导出 往返', () => {
  it('两份文件除 exportedAt 外完全相同', async () => {
    const first = await json<Record<string, unknown>>(
      await SELF.fetch('http://localhost/api/export', { headers: OWNER }),
    );
    const importRes = await seedViaImport('replace', first);
    expect(importRes.status).toBe(200);
    const second = await json<Record<string, unknown>>(
      await SELF.fetch('http://localhost/api/export', { headers: OWNER }),
    );

    const strip = (o: Record<string, unknown>) => {
      const { exportedAt, ...rest } = o;
      return rest;
    };
    expect(strip(second)).toEqual(strip(first));

    const { imported } = await json<{ imported: number }>(importRes);
    const entries = (first.entries as unknown[]).length;
    expect(imported).toBe(entries);
  });
});
