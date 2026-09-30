import { SELF } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { applyInitSql } from './apply-init';
import { seedForTests } from './seed-for-tests';
import jwks from './fixtures/jwks.json';
import tokens from './fixtures/tokens.json';

// WP15 验收（07-mcp-scanner）：工具全可见；搜索正确；capture 生成待整理；
// propose_change 只生成提案不改条目（含密钥草稿被拒）；get_rules/get_collection_rules 返回内容；
// backup 令牌调 /mcp → 403。
// MCP 用 Streamable HTTP JSON-RPC：initialize → 请求。

const T = tokens.tokens;
const originalFetch = globalThis.fetch;
const AGENT = { 'Cf-Access-Jwt-Assertion': T.agent, Host: 'localhost' };
const BACKUP = { 'Cf-Access-Jwt-Assertion': T.backup, Host: 'localhost' };

beforeAll(async () => {
  await applyInitSql();
  await seedForTests();
  // 种子数据（直接 SQL 注入 change_log 的部分由 applyInitSql 后补）
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

const PROTOCOL = '2025-06-18';
let initialized = false;

async function rpc(
  method: string,
  params: Record<string, unknown> = {},
  headers: Record<string, string> = AGENT,
) {
  const res = await SELF.fetch('http://localhost/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...headers,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Math.floor(Math.random() * 1e6),
      method,
      params: { ...params, _meta: { progressToken: undefined } },
    }),
  });
  const text = await res.text();
  // Streamable HTTP 可能返回 text/event-stream：逐行解析 data:
  const parseOne = (line: string) => {
    try {
      return JSON.parse(line.replace(/^data:\s*/, '')) as {
        result?: unknown;
        error?: { message: string };
      };
    } catch {
      return undefined;
    }
  };
  let parsed: { result?: unknown; error?: { message: string } } | undefined;
  if (text.startsWith('event:') || text.includes('\ndata:')) {
    for (const line of text.split('\n')) {
      const p = line.startsWith('data:') ? parseOne(line) : undefined;
      if (p) parsed = p;
    }
  } else {
    const p = parseOne(text);
    if (p) parsed = p;
  }
  return { status: res.status, body: parsed, raw: text };
}

beforeAll(async () => {
  if (initialized) return;
  await rpc('initialize', {
    protocolVersion: PROTOCOL,
    capabilities: {},
    clientInfo: { name: 'test', version: '1' },
  });
  initialized = true;
});

describe('MCP：角色', () => {
  it('backup 令牌调用 /mcp → 403', async () => {
    const res = await rpc('initialize', {}, BACKUP);
    expect(res.status).toBe(403);
  });
});

describe('MCP：工具', () => {
  it('tools/list 包含全部 9 个工具', async () => {
    const { body } = await rpc('tools/list');
    const tools = (body?.result as { tools: Array<{ name: string }> }).tools.map((t) => t.name);
    expect(tools).toEqual(
      expect.arrayContaining([
        'search_entries',
        'get_entry',
        'list_stacks',
        'get_stack_checklist',
        'capture',
        'list_inbox',
        'propose_change',
        'get_rules',
        'get_collection_rules',
      ]),
    );
    expect(tools).toHaveLength(9);
  });

  it('resources/list 与 prompts/list', async () => {
    const res = await rpc('resources/list');
    const uris = (res.body?.result as { resources: Array<{ uri: string }> }).resources.map(
      (r) => r.uri,
    );
    expect(uris).toContain('aikit://rules');
    expect(uris).toContain('aikit://collection-rules');

    const pr = await rpc('prompts/list');
    const names = (pr.body?.result as { prompts: Array<{ name: string }> }).prompts.map(
      (p) => p.name,
    );
    expect(names).toEqual(
      expect.arrayContaining(['collect_config', 'organize_inbox', 'setup_machine']),
    );
  });
});

async function callTool(name: string, args: Record<string, unknown>) {
  const res = await rpc('tools/call', { name, arguments: args });
  const result = res.body?.result as
    { content: Array<{ text: string }>; isError?: boolean } | undefined;
  return {
    status: res.status,
    isError: result?.isError ?? false,
    text: result?.content?.map((c) => c.text).join('\n') ?? '',
  };
}

describe('MCP：行为', () => {
  it('search_entries 返回正确结果', async () => {
    const out = await callTool('search_entries', { query: 'playwright' });
    expect(out.isError).toBe(false);
    expect(out.text).toContain('Playwright MCP');
  });

  it('get_entry 按类型+标识返回 Markdown', async () => {
    const out = await callTool('get_entry', { type: 'tool', slug: 'claude-code' });
    expect(out.text).toContain('Claude Code');
    expect(out.text).toContain('## 安装（Windows 原生）');
  });

  it('list_stacks 返回环境', async () => {
    const out = await callTool('list_stacks', {});
    expect(out.text).toContain('主力 Windows 工作站');
  });

  it('get_stack_checklist 返回安装清单 Markdown', async () => {
    const out = await callTool('get_stack_checklist', { stack: '主力 Windows 工作站' });
    expect(out.text).toContain('安装清单');
    expect(out.text).toContain('irm https://claude.ai/install.ps1');
  });

  it('capture 生成待整理条目', async () => {
    const out = await callTool('capture', { type: 'tool', text: 'MCP 测试随手记的一条' });
    expect(out.text).toContain('已存入待整理');
    expect(out.text).toMatch(/id=\w+/);
  });

  it('propose_change 只生成提案，不直接修改条目', async () => {
    const before = await callTool('list_inbox', {});
    const out = await callTool('propose_change', {
      kind: 'create',
      draft: { type: 'tool', slug: 'mcp-proposal-demo', title: 'MCP 提案演示' },
      reason: '来自测试',
    });
    expect(out.isError).toBe(false);
    expect(out.text).toContain('pending');

    // 条目本身没有变化：按提案条目的标识查，不应出现
    const search = await callTool('search_entries', { query: 'mcp-proposal-demo' });
    expect(search.text).not.toContain('工具/mcp-proposal-demo');
    expect(before.text).not.toContain('MCP 提案演示');
  });

  it('含密钥的草稿被拒绝，并返回可读原因', async () => {
    const fakeKey = 'sk-ant-' + 'Z'.repeat(30);
    const out = await callTool('propose_change', {
      kind: 'create',
      draft: { type: 'tool', title: '坏草稿', snippets: [{ code: fakeKey }] },
    });
    expect(out.isError).toBe(true);
    expect(out.text).toContain('密钥');
    expect(out.text).not.toContain(fakeKey);
  });

  it('get_rules 返回整理规则', async () => {
    const out = await callTool('get_rules', {});
    expect(out.text).toContain('名称用官方名称');
  });

  it('get_collection_rules 提示按规则在本机收集、脱敏后用 propose_change 提交', async () => {
    const out = await callTool('get_collection_rules', {});
    expect(out.text).toContain('白名单');
    expect(out.text).toContain('脱敏');
    expect(out.text).toContain('propose_change');
  });

  it('资源 aikit://rules 与 aikit://collection-rules 可读', async () => {
    const rules = await rpc('resources/read', { uri: 'aikit://rules' });
    const text = JSON.stringify(rules.body?.result);
    expect(text).toContain('名称用官方名称');

    const collection = await rpc('resources/read', { uri: 'aikit://collection-rules' });
    const text2 = JSON.stringify(collection.body?.result);
    expect(text2).toContain('白名单');
  });

  it('提示词 collect_config 返回引导（读规则→脱敏→propose_change→汇总）', async () => {
    const res = await rpc('prompts/get', {
      name: 'collect_config',
      arguments: { stack: '主力 Windows 工作站' },
    });
    const text = JSON.stringify(res.body?.result);
    expect(text).toContain('get_collection_rules');
    expect(text).toContain('propose_change');
    expect(text).toContain('主力 Windows 工作站');
  });
});
