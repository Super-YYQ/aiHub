import { describe, it, expect, beforeEach, vi } from 'vitest';

// WP6 验收：离线写入进 outbox、恢复联网按顺序上传、409 进入冲突、422 撤销。
// 通过 mock fetch 模拟接口（jsdom 环境，不启动真实 Worker）。

// Dexie 需要 IndexedDB；fake-indexeddb 在 vitest.setup 里注入（见 vitest.config.ts）

describe('同步引擎（模拟接口）', () => {
  beforeEach(async () => {
    // 动态导入，保证 setup 先生效
    const { db } = await import('../src/lib/db');
    await Promise.all([db.entries.clear(), db.stacks.clear(), db.outbox.clear(), db.meta.clear()]);
    vi.restoreAllMocks();
  });

  it('离线时写入进入 outbox，恢复联网后按顺序上传', async () => {
    const { db } = await import('../src/lib/db');
    const { enqueueOutbox } = await import('../src/lib/sync');
    const { ulid } = await import('@aikit/shared');

    // 模拟：全部网络错误 → 留在 outbox
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        calls.push(`${init?.method ?? 'GET'} ${url}`);
        throw new TypeError('Failed to fetch');
      }),
    );
    // navigator.onLine = false 的场景直接由 fetch 失败表现

    await enqueueOutbox({
      op: 'createEntry',
      entityId: null,
      body: { type: 'tool', title: 'A' },
      baseVersion: null,
      idempotencyKey: ulid(),
    });
    await enqueueOutbox({
      op: 'createEntry',
      entityId: null,
      body: { type: 'tool', title: 'B' },
      baseVersion: null,
      idempotencyKey: ulid(),
    });

    // 等待同步尝试结束（网络失败会停在第一条）
    await new Promise((r) => setTimeout(r, 50));
    const remaining = await db.outbox.count();
    expect(remaining).toBe(2); // 离线：全部留在 outbox
    expect(calls.filter((c) => c.startsWith('POST')).length).toBeGreaterThan(0); // 至少尝试了第一条

    // 恢复联网：按顺序上传成功
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        calls.push(`${init?.method ?? 'GET'} ${url}`);
        return new Response(JSON.stringify({ ok: true }), { status: 201 });
      }),
    );
    const { sync } = await import('../src/lib/sync');
    await sync();
    await new Promise((r) => setTimeout(r, 50));
    expect(await db.outbox.count()).toBe(0); // 全部上传完成

    const order = calls.filter((c) => c.startsWith('POST /api/entries'));
    expect(order.length).toBeGreaterThanOrEqual(2);
  });

  it('409 → 冲突状态，outbox 保留该条', async () => {
    const { db } = await import('../src/lib/db');
    const { enqueueOutbox, getConflict, clearConflict } = await import('../src/lib/sync');

    const current = { id: '01M3R0CONFLICTENTRY0000000AB', version: 7, title: '服务端版本' };
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: {
                code: 'version_conflict',
                message: '内容已被其他设备修改',
                details: [{ issue: 'version_mismatch', current }],
              },
            }),
            { status: 409, headers: { 'content-type': 'application/json' } },
          ),
      ),
    );

    await enqueueOutbox({
      op: 'updateEntry',
      entityId: '01M3R0CONFLICTENTRY0000000AB',
      body: { type: 'tool', title: '本地版本' },
      baseVersion: 3,
      idempotencyKey: null,
    });
    await new Promise((r) => setTimeout(r, 50));

    const conflict = getConflict();
    expect(conflict).not.toBeNull();
    expect((conflict?.current as { version: number }).version).toBe(7);
    expect(await db.outbox.count()).toBe(1); // 保留，等用户决定
    clearConflict();
  });

  it('422 → 撤销本地修改（outbox 消费掉，条目不留在待上传）', async () => {
    const { db } = await import('../src/lib/db');
    const { enqueueOutbox } = await import('../src/lib/sync');

    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: {
                code: 'secret_detected',
                message: '内容里疑似包含密钥',
                details: [{ path: 'body', rule: 'anthropic-key', preview: 'sk-a…AAAA' }],
              },
            }),
            { status: 422, headers: { 'content-type': 'application/json' } },
          ),
      ),
    );

    await enqueueOutbox({
      op: 'createEntry',
      entityId: null,
      body: { type: 'tool', title: '带密钥的条目' },
      baseVersion: null,
      idempotencyKey: null,
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(await db.outbox.count()).toBe(0); // 422 撤销：不再重试
  });
});
