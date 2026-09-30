import { SELF, env } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { applyInitSql } from './apply-init';
import jwks from './fixtures/jwks.json';
import tokens from './fixtures/tokens.json';

// WP4 验收：写入规则（batch 行数）、If-Match 冲突、密钥扫描 422、环境删除保留条目。

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

const counts = async () => {
  const row = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM entries) AS entries, (SELECT COUNT(*) FROM revisions) AS revisions,
            (SELECT COUNT(*) FROM change_log) AS log, (SELECT COUNT(*) FROM stack_entries) AS members`,
  ).first<{ entries: number; revisions: number; log: number; members: number }>();
  if (!row) throw new Error('counts 查询失败');
  return row;
};

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

const draft = (over: Record<string, unknown> = {}) => ({
  type: 'tool',
  slug: 'test-tool',
  title: '测试工具',
  summary: '用来验收',
  status: 'using',
  tags: ['验收'],
  ...over,
});

describe('条目写入规则（batch 行数断言）', () => {
  it('新建：实体 +1、修订 0、change_log +1', async () => {
    const before = await counts();
    const res = await SELF.fetch('http://localhost/api/entries', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...OWNER },
      body: JSON.stringify(draft()),
    });
    expect(res.status).toBe(201);
    const after = await counts();
    expect(after.entries).toBe(before.entries + 1);
    expect(after.revisions).toBe(before.revisions);
    expect(after.log).toBe(before.log + 1);
  });

  it('更新：修订 +1、实体数不变、change_log +1', async () => {
    const created = await json<{ id: string; version: number }>(
      await SELF.fetch('http://localhost/api/entries', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...OWNER },
        body: JSON.stringify(draft({ slug: 'batch-update' })),
      }),
    );
    const before = await counts();
    const res = await SELF.fetch(`http://localhost/api/entries/${created.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'If-Match': `"${created.version}"`, ...OWNER },
      body: JSON.stringify(draft({ slug: 'batch-update', summary: '改过了' })),
    });
    expect(res.status).toBe(200);
    const after = await counts();
    expect(after.entries).toBe(before.entries);
    expect(after.revisions).toBe(before.revisions + 1);
    expect(after.log).toBe(before.log + 1);
  });

  it('删除：软删除 + 修订 +1 + change_log +1 + 成员关系清零', async () => {
    const created = await json<{ id: string; version: number }>(
      await SELF.fetch('http://localhost/api/entries', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...OWNER },
        body: JSON.stringify(draft({ slug: 'batch-delete' })),
      }),
    );
    const before = await counts();
    const res = await SELF.fetch(`http://localhost/api/entries/${created.id}`, {
      method: 'DELETE',
      headers: { 'If-Match': `"${created.version}"`, ...OWNER },
    });
    expect(res.status).toBe(204);
    const after = await counts();
    expect(after.revisions).toBe(before.revisions + 1);
    expect(after.log).toBe(before.log + 1);
    const row = await env.DB.prepare(`SELECT deleted_at FROM entries WHERE id = ?`)
      .bind(created.id)
      .first<{ deleted_at: string | null }>();
    expect(row?.deleted_at).not.toBeNull();
  });
});

describe('If-Match 与冲突', () => {
  it('缺 If-Match → 428 precondition_required', async () => {
    const created = await json<{ id: string }>(
      await SELF.fetch('http://localhost/api/entries', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...OWNER },
        body: JSON.stringify(draft({ slug: 'precondition' })),
      }),
    );
    const res = await SELF.fetch(`http://localhost/api/entries/${created.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...OWNER },
      body: JSON.stringify(draft({ slug: 'precondition' })),
    });
    expect(res.status).toBe(428);
    const body = await json<{ error: { code: string } }>(res);
    expect(body.error.code).toBe('precondition_required');
  });

  it('过期 If-Match → 409 version_conflict，details.current 是最新版本', async () => {
    const created = await json<{ id: string; version: number }>(
      await SELF.fetch('http://localhost/api/entries', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...OWNER },
        body: JSON.stringify(draft({ slug: 'conflict' })),
      }),
    );
    // 先改一次（version → 2）
    await SELF.fetch(`http://localhost/api/entries/${created.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'If-Match': `"${created.version}"`, ...OWNER },
      body: JSON.stringify(draft({ slug: 'conflict', summary: 'v2' })),
    });
    // 再用旧版本号提交 → 409
    const res = await SELF.fetch(`http://localhost/api/entries/${created.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'If-Match': `"${created.version}"`, ...OWNER },
      body: JSON.stringify(draft({ slug: 'conflict', summary: 'v3' })),
    });
    expect(res.status).toBe(409);
    const body = await json<{
      error: { code: string; details: Array<{ current: { version: number } }> };
    }>(res);
    expect(body.error.code).toBe('version_conflict');
    expect(body.error.details[0].current.version).toBe(2);
  });
});

describe('密钥扫描（422 secret_detected，不回显原文）', () => {
  it('片段里出现假密钥 → 422，响应不含原文', async () => {
    const fakeKey = 'sk-ant-' + 'Z'.repeat(30);
    const res = await SELF.fetch('http://localhost/api/entries', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...OWNER },
      body: JSON.stringify(
        draft({ slug: 'secret-demo', snippets: [{ code: fakeKey, lang: 'text' }] }),
      ),
    });
    expect(res.status).toBe(422);
    const text = await res.text();
    expect(text).not.toContain(fakeKey);
    const body = JSON.parse(text) as {
      error: { code: string; details: Array<{ rule: string; preview: string }> };
    };
    expect(body.error.code).toBe('secret_detected');
    expect(body.error.details[0].rule).toBe('anthropic-key');
  });
});

describe('环境与成员关系', () => {
  it('删除环境后条目仍在，成员关系消失', async () => {
    const stack = await json<{ id: string; version: number }>(
      await SELF.fetch('http://localhost/api/stacks', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...OWNER },
        body: JSON.stringify({ name: '删除验收机', kind: 'pc', os: 'windows' }),
      }),
    );
    const entry = await json<{ id: string }>(
      await SELF.fetch('http://localhost/api/entries', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...OWNER },
        body: JSON.stringify(draft({ slug: 'stack-delete-demo' })),
      }),
    );
    await SELF.fetch(`http://localhost/api/stacks/${stack.id}/entries`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...OWNER },
      body: JSON.stringify({ add: [{ entryId: entry.id, note: '' }], remove: [] }),
    });

    const del = await SELF.fetch(`http://localhost/api/stacks/${stack.id}`, {
      method: 'DELETE',
      headers: { 'If-Match': `"${stack.version}"`, ...OWNER },
    });
    expect(del.status).toBe(204);

    const still = await SELF.fetch(`http://localhost/api/entries/${entry.id}`, {
      headers: OWNER,
    });
    expect(still.status).toBe(200); // 条目还在
    const entryBody = await json<{ stacks: unknown[] }>(still);
    expect(entryBody.stacks).toHaveLength(0); // 成员关系消失
    const member = await env.DB.prepare(`SELECT 1 FROM stack_entries WHERE stack_id = ?`)
      .bind(stack.id)
      .first();
    expect(member).toBeNull();
  });
});

describe('修订与恢复', () => {
  it('修改三次 → 修订列表 3 条；恢复旧版本生成新版本', async () => {
    const created = await json<{ id: string; version: number }>(
      await SELF.fetch('http://localhost/api/entries', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...OWNER },
        body: JSON.stringify(draft({ slug: 'revisions-demo' })),
      }),
    );
    let version = created.version;
    for (const summary of ['一改', '二改', '三改']) {
      const res = await SELF.fetch(`http://localhost/api/entries/${created.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'If-Match': `"${version}"`, ...OWNER },
        body: JSON.stringify(draft({ slug: 'revisions-demo', summary })),
      });
      const body = await json<{ version: number }>(res);
      version = body.version;
    }
    const list = await json<Array<{ version: number }>>(
      await SELF.fetch(`http://localhost/api/entries/${created.id}/revisions`, { headers: OWNER }),
    );
    expect(list).toHaveLength(3);
    expect(list.map((r) => r.version)).toEqual([3, 2, 1]);
    const snap = await json<{ summary: string }>(
      await SELF.fetch(`http://localhost/api/entries/${created.id}/revisions/1`, {
        headers: OWNER,
      }),
    );
    expect(snap.summary).toBe('用来验收');

    const restored = await json<{ version: number; summary: string }>(
      await SELF.fetch(`http://localhost/api/entries/${created.id}/restore`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'If-Match': `"${version}"`, ...OWNER },
        body: JSON.stringify({ version: 1 }),
      }),
    );
    expect(restored.version).toBe(5); // 1 + 三次修改(4) + 恢复(5)
    expect(restored.summary).toBe('用来验收');
    // 旧版本仍在
    const list2 = await json<Array<{ version: number }>>(
      await SELF.fetch(`http://localhost/api/entries/${created.id}/revisions`, { headers: OWNER }),
    );
    expect(list2).toHaveLength(4);
  });
});
