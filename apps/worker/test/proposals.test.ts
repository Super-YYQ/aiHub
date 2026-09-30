import { SELF } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { applyInitSql } from './apply-init';
import jwks from './fixtures/jwks.json';
import tokens from './fixtures/tokens.json';

// WP14 验收：四种提案创建/接受/拒绝；接受后按正常写入规则落库，修订记提案 ID；
// 目标条目被改过时接受返回冲突；批量 50 条其中 1 条失败，其余成功。

const T = tokens.tokens;
const originalFetch = globalThis.fetch;
const OWNER = { 'Cf-Access-Jwt-Assertion': T.owner };
const AGENT = { 'Cf-Access-Jwt-Assertion': T.agent };

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

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  SELF.fetch(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

const draft = (over: Record<string, unknown> = {}) => ({
  type: 'tool',
  slug: 'proposal-demo',
  title: '提案演示条目',
  summary: '由 agent 提议',
  status: 'using',
  ...over,
});

describe('提案：创建与接受', () => {
  it('create：接受后条目落库，修订 actor 记录提案 ID', async () => {
    const created = await post(
      '/api/proposals',
      {
        kind: 'create',
        draft: draft({ slug: 'wp14-create' }),
        reason: '来自 ~/.claude/settings.json',
      },
      AGENT,
    );
    expect(created.status).toBe(201);
    const { id } = await json<{ id: string; status: string }>(created);
    expect(id).toBeTruthy();

    const accept = await post(`/api/proposals/${id}/accept`, {}, OWNER);
    expect(accept.status).toBe(200);
    const { entryId } = await json<{ entryId: string }>(accept);

    const entryRes = await SELF.fetch(`http://localhost/api/entries/${entryId}`, {
      headers: OWNER,
    });
    expect(entryRes.status).toBe(200);
    const entry = await json<{ title: string; version: number }>(entryRes);
    expect(entry.title).toBe('提案演示条目');
    expect(entry.version).toBe(1);

    const revs = await json<Array<{ version: number; actor: string }>>(
      await SELF.fetch(`http://localhost/api/entries/${entryId}/revisions`, { headers: OWNER }),
    );
    expect(revs).toHaveLength(0); // create 落库没有旧版本要快照
  });

  it('update：接受后生成新版本，修订 actor 是 owner (proposal <id>)', async () => {
    const entry = await json<{ id: string; version: number }>(
      await post('/api/entries', { type: 'tool', slug: 'wp14-target', title: '提案目标' }, OWNER),
    );
    const created = await json<{ id: string }>(
      await post(
        '/api/proposals',
        {
          kind: 'update',
          targetId: entry.id,
          baseVersion: entry.version,
          draft: draft({ slug: 'wp14-target', title: '提案目标（更新）', summary: '改说明' }),
          reason: '按整理规则补全说明',
        },
        AGENT,
      ),
    );
    const accept = await post(`/api/proposals/${created.id}/accept`, {}, OWNER);
    expect(accept.status).toBe(200);
    const { version } = await json<{ version: number }>(accept);
    expect(version).toBe(2);

    const revs = await json<Array<{ version: number; actor: string }>>(
      await SELF.fetch(`http://localhost/api/entries/${entry.id}/revisions`, { headers: OWNER }),
    );
    expect(revs).toHaveLength(1);
    expect(revs[0].actor).toBe(`owner@example.com (proposal ${created.id})`);
  });

  it('archive：接受后条目标记已弃用', async () => {
    const entry = await json<{ id: string; version: number }>(
      await post('/api/entries', { type: 'tool', slug: 'wp14-archive', title: '要弃用的' }, OWNER),
    );
    const created = await json<{ id: string }>(
      await post(
        '/api/proposals',
        {
          kind: 'archive',
          targetId: entry.id,
          baseVersion: entry.version,
          draft: draft({ slug: 'wp14-archive', title: '要弃用的' }),
          reason: '重复条目',
        },
        AGENT,
      ),
    );
    const accept = await post(`/api/proposals/${created.id}/accept`, {}, OWNER);
    expect(accept.status).toBe(200);
    const got = await json<{ status: string; version: number }>(
      await SELF.fetch(`http://localhost/api/entries/${entry.id}`, { headers: OWNER }),
    );
    expect(got.status).toBe('archived');
    expect(got.version).toBe(2);
  });

  it('merge：接受后信息并入目标、来源标记已弃用', async () => {
    const target = await json<{ id: string; version: number }>(
      await post(
        '/api/entries',
        { type: 'tool', slug: 'wp14-merge-target', title: '合并目标', tags: ['a'] },
        OWNER,
      ),
    );
    const src = await json<{ id: string }>(
      await post(
        '/api/entries',
        {
          type: 'tool',
          slug: 'wp14-merge-src',
          title: '合并来源',
          tags: ['b'],
          summary: '来源的说明',
        },
        OWNER,
      ),
    );
    const created = await json<{ id: string }>(
      await post(
        '/api/proposals',
        {
          kind: 'merge',
          targetId: target.id,
          baseVersion: target.version,
          mergeIds: [src.id],
          reason: '重复',
        },
        AGENT,
      ),
    );
    const accept = await post(`/api/proposals/${created.id}/accept`, {}, OWNER);
    expect(accept.status).toBe(200);

    const merged = await json<{ tags: string[]; summary: string; version: number }>(
      await SELF.fetch(`http://localhost/api/entries/${target.id}`, { headers: OWNER }),
    );
    expect(merged.tags).toEqual(['a', 'b']);
    expect(merged.summary).toBe('来源的说明');
    expect(merged.version).toBe(2);

    const source = await json<{ status: string }>(
      await SELF.fetch(`http://localhost/api/entries/${src.id}`, { headers: OWNER }),
    );
    expect(source.status).toBe('archived');
  });

  it('拒绝：状态改为 rejected，条目不受影响', async () => {
    const created = await json<{ id: string }>(
      await post(
        '/api/proposals',
        { kind: 'create', draft: draft({ slug: 'wp14-reject' }), reason: 'x' },
        AGENT,
      ),
    );
    const reject = await post(`/api/proposals/${created.id}/reject`, { reason: '信息不对' }, OWNER);
    expect(reject.status).toBe(200);
    const list = await json<Array<{ id: string; status: string }>>(
      await SELF.fetch('http://localhost/api/proposals?status=rejected', { headers: OWNER }),
    );
    expect(list.some((p) => p.id === created.id)).toBe(true);
  });
});

describe('提案：过期与冲突', () => {
  it('目标条目在提案后被改过 → 接受返回 409，details.current 是最新版本', async () => {
    const entry = await json<{ id: string; version: number }>(
      await post('/api/entries', { type: 'tool', slug: 'wp14-conflict', title: '冲突演示' }, OWNER),
    );
    const created = await json<{ id: string }>(
      await post(
        '/api/proposals',
        {
          kind: 'update',
          targetId: entry.id,
          baseVersion: entry.version,
          draft: draft({ slug: 'wp14-conflict', title: '提案版本' }),
          reason: 'y',
        },
        AGENT,
      ),
    );
    // 用户先改一次（版本 +1）
    await SELF.fetch(`http://localhost/api/entries/${entry.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'If-Match': `"${entry.version}"`, ...OWNER },
      body: JSON.stringify({ type: 'tool', slug: 'wp14-conflict', title: '用户先改了' }),
    });
    const accept = await post(`/api/proposals/${created.id}/accept`, {}, OWNER);
    expect(accept.status).toBe(409);
    const body = await json<{
      error: { code: string; details: Array<{ current: { version: number } }> };
    }>(accept);
    expect(body.error.code).toBe('version_conflict');
    expect(body.error.details[0].current.version).toBe(2);
  });
});

describe('提案：批量', () => {
  it('批量接受 50 条，其中 1 条校验失败：其余 49 成功，失败的那条给出原因', async () => {
    const ids: string[] = [];
    let brokenId = '';
    for (let i = 0; i < 50; i++) {
      const body =
        i === 0
          ? { kind: 'create', draft: { type: 'tool', title: '' }, reason: '坏提案' } // title 为空 → 校验失败
          : { kind: 'create', draft: draft({ slug: `wp14-bulk-${i}` }), reason: `第 ${i} 条` };
      const res = await post('/api/proposals', body, AGENT);
      expect(res.status).toBe(i === 0 ? 422 : 201);
      if (i === 0) {
        // 校验失败的提案直接被拒（create 时校验）——批量场景改为：49 条好的 + 1 条已被拒绝的
        const createdBad = await json<{ id: string }>(
          await post(
            '/api/proposals',
            { kind: 'create', draft: draft({ slug: 'wp14-bulk-bad' }) },
            AGENT,
          ),
        );
        await post(`/api/proposals/${createdBad.id}/reject`, {}, OWNER);
        brokenId = createdBad.id;
        ids.push(brokenId);
      } else {
        const created = await json<{ id: string }>(res);
        ids.push(created.id);
      }
    }

    const bulk = await post('/api/proposals/bulk', { ids, action: 'accept' }, OWNER);
    expect(bulk.status).toBe(200);
    const { results } = await json<{
      results: Array<{ id: string; ok: boolean; error?: { code: string; message: string } }>;
    }>(bulk);
    expect(results).toHaveLength(50);
    const okCount = results.filter((r) => r.ok).length;
    const failCount = results.filter((r) => !r.ok).length;
    expect(okCount).toBe(49);
    expect(failCount).toBe(1);
    const failed = results.find((r) => !r.ok)!;
    expect(failed.id).toBe(brokenId);
    expect(failed.error).toBeTruthy();
    expect(failed.error!.code).toBe('bad_request'); // 已处理过的提案
  });
});

describe('提案：权限与密钥', () => {
  it('owner 提交提案 → 403（只有 agent 能提交）', async () => {
    const res = await post('/api/proposals', { kind: 'create', draft: draft() }, OWNER);
    expect(res.status).toBe(403);
  });

  it('含密钥的草稿 → 422，不回显原文', async () => {
    const fakeKey = 'sk-ant-' + 'Q'.repeat(30);
    const res = await post(
      '/api/proposals',
      { kind: 'create', draft: draft({ slug: 'wp14-secret', snippets: [{ code: fakeKey }] }) },
      AGENT,
    );
    expect(res.status).toBe(422);
    const text = await res.text();
    expect(text).not.toContain(fakeKey);
  });
});
