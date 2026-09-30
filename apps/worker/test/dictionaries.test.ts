import { SELF } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { applyInitSql } from './apply-init';
import jwks from './fixtures/jwks.json';
import tokens from './fixtures/tokens.json';

// WP4：类型/平台（内置保护、in_use）、设置（整理规则）、标签改名。

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
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  SELF.fetch(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...OWNER, ...headers },
    body: JSON.stringify(body),
  });

describe('类型与平台', () => {
  it('新建自定义类型后可建该类型条目；删除仍被引用时 in_use', async () => {
    const created = await SELF.fetch('http://localhost/api/types', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...OWNER },
      body: JSON.stringify({
        id: 'workflow',
        name: '工作流',
        color: '#556b2f',
        fieldTemplate: ['触发'],
        sort: 9,
      }),
    });
    expect(created.status).toBe(201);

    const entry = await json<{ id: string }>(
      await post('/api/entries', { type: 'workflow', slug: 'wf-demo', title: '工作流条目' }),
    );
    expect(entry.id).toBeTruthy();

    const del = await SELF.fetch('http://localhost/api/types/workflow', {
      method: 'DELETE',
      headers: OWNER,
    });
    expect(del.status).toBe(409);
    const body = await json<{ error: { code: string } }>(del);
    expect(body.error.code).toBe('in_use');
  });

  it('内置类型不能删除', async () => {
    const del = await SELF.fetch('http://localhost/api/types/tool', {
      method: 'DELETE',
      headers: OWNER,
    });
    expect(del.status).toBe(409);
    const body = await json<{ error: { code: string } }>(del);
    expect(body.error.code).toBe('in_use');
  });

  it('内置类型可以改名、改颜色', async () => {
    const res = await SELF.fetch('http://localhost/api/types/tool', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...OWNER },
      body: JSON.stringify({
        name: '工具（改名）',
        color: '#1f5fa8',
        fieldTemplate: ['类别'],
        sort: 0,
      }),
    });
    expect(res.status).toBe(200);
    const type = await json<{ name: string; builtin: boolean }>(res);
    expect(type.name).toBe('工具（改名）');
    expect(type.builtin).toBe(true);
    // 改回，避免影响其他用例
    await SELF.fetch('http://localhost/api/types/tool', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...OWNER },
      body: JSON.stringify({
        name: '工具',
        color: '#2f6db5',
        fieldTemplate: ['类别', '安装方式', '配置目录', '费用'],
        sort: 0,
      }),
    });
  });

  it('平台：新建、改名、仍被引用时删除 in_use、解除引用后可删', async () => {
    const created = await SELF.fetch('http://localhost/api/platforms', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...OWNER },
      body: JSON.stringify({ id: 'windsurf', name: 'Windsurf', sort: 9 }),
    });
    expect(created.status).toBe(201);

    const entry = await json<{ id: string }>(
      await post('/api/entries', {
        type: 'tool',
        slug: 'plat-demo',
        title: '平台演示',
        platforms: ['windsurf'],
      }),
    );
    const del = await SELF.fetch('http://localhost/api/platforms/windsurf', {
      method: 'DELETE',
      headers: OWNER,
    });
    expect(del.status).toBe(409);

    // 解除引用后可删
    await SELF.fetch(`http://localhost/api/entries/${entry.id}`, {
      method: 'DELETE',
      headers: { 'If-Match': '"1"', ...OWNER },
    });
    const del2 = await SELF.fetch('http://localhost/api/platforms/windsurf', {
      method: 'DELETE',
      headers: OWNER,
    });
    expect(del2.status).toBe(204);
  });
});

describe('设置：整理规则', () => {
  it('读取默认内容，保存后返回新内容', async () => {
    const before = await json<{ value: string }>(
      await SELF.fetch('http://localhost/api/settings/rules', { headers: OWNER }),
    );
    expect(before.value).toContain('名称用官方名称');

    const saved = await json<{ value: string }>(
      await SELF.fetch('http://localhost/api/settings/rules', {
        method: 'PUT',
        headers: { 'content-type': 'application/json', ...OWNER },
        body: JSON.stringify({ value: '- 新规则内容\n- 第二条' }),
      }),
    );
    expect(saved.value).toContain('新规则内容');
  });

  it('保存含密钥的规则 → 422 secret_detected', async () => {
    const fakeKey = 'ghp_' + 'x'.repeat(36);
    const res = await SELF.fetch('http://localhost/api/settings/rules', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...OWNER },
      body: JSON.stringify({ value: `规则里不能有这个 ${fakeKey}` }),
    });
    expect(res.status).toBe(422);
    expect(await res.text()).not.toContain(fakeKey);
  });
});

describe('标签改名（合并）', () => {
  it('改名后条目更新且各有一条修订', async () => {
    const e1 = await json<{ id: string }>(
      await post('/api/entries', {
        type: 'tool',
        slug: 'tag-a',
        title: 'A',
        tags: ['前端', '演示'],
      }),
    );
    const e2 = await json<{ id: string }>(
      await post('/api/entries', { type: 'tool', slug: 'tag-b', title: 'B', tags: ['前端'] }),
    );

    const res = await post('/api/tags/rename', { from: '前端', to: 'Web' });
    expect(res.status).toBe(200);
    const { renamed } = await json<{ renamed: number }>(res);
    expect(renamed).toBe(2);

    for (const id of [e1.id, e2.id]) {
      const entry = await json<{ tags: string[]; version: number }>(
        await SELF.fetch(`http://localhost/api/entries/${id}`, { headers: OWNER }),
      );
      expect(entry.tags).toContain('Web');
      expect(entry.tags.some((t) => t === '前端')).toBe(false);
      expect(entry.version).toBe(2); // 每个受影响条目都有修订
      const revs = await json<Array<{ version: number }>>(
        await SELF.fetch(`http://localhost/api/entries/${id}/revisions`, { headers: OWNER }),
      );
      expect(revs).toHaveLength(1);
    }

    // 合并到已存在的标签
    const res2 = await post('/api/tags/rename', { from: 'Web', to: '演示' });
    const merged = await json<{ renamed: number }>(res2);
    expect(merged.renamed).toBe(2);
    const entry = await json<{ tags: string[] }>(
      await SELF.fetch(`http://localhost/api/entries/${e1.id}`, { headers: OWNER }),
    );
    expect(entry.tags.filter((t) => t === '演示').length).toBe(1); // 去重合并
  });
});
