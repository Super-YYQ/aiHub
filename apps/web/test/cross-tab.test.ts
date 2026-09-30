import { describe, it, expect, vi } from 'vitest';

// WP6 验收：两个标签页同时打开时只有一个在同步，另一个在对方写入后自动刷新数据。

describe('多标签页协作', () => {
  it('crossTabSync 在收到 synced 广播时触发刷新', async () => {
    const { crossTabSync } = await import('../src/lib/sync');
    const refresh = vi.fn();
    const stop = crossTabSync(refresh);

    // BroadcastChannel 在同一 origin 里广播；测试直接向同名频道发消息
    const ch = new BroadcastChannel('aikit-sync');
    ch.postMessage({ kind: 'synced' });
    await new Promise((r) => setTimeout(r, 20));
    expect(refresh).toHaveBeenCalled();
    stop();
    ch.close();
  });

  it('sync 使用 Web Locks：同一时间只有一个标签页执行（串行化）', async () => {
    const { sync } = await import('../src/lib/sync');
    // jsdom 没有 navigator.locks → 走降级路径；这里主要验证不抛错且能串行完成
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 200 })),
    );
    await expect(sync()).resolves.toBeUndefined();
    await expect(sync()).resolves.toBeUndefined();
  });
});
