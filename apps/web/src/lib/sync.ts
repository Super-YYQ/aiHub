// 同步引擎（04-frontend#状态与离线同步）：
// 拉取（启动/可见/联网/5 分钟/上传成功后）+ outbox 顺序上传 + 退避 + Web Locks + BroadcastChannel。
import { ulid } from '@aikit/shared';
import { api, ApiError } from './api';
import { db, getMeta, setMeta, type OutboxItem } from './db';

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'conflict';

interface SyncPage {
  entries: Array<Record<string, unknown> & { id: string }>;
  stacks: Array<Record<string, unknown> & { id: string }>;
  types: Array<Record<string, unknown> & { id: string }>;
  platforms: Array<Record<string, unknown> & { id: string }>;
  proposals: Array<Record<string, unknown> & { id: string }>;
  deleted: { entries: string[]; stacks: string[]; types: string[]; platforms: string[] };
  cursor: number;
  hasMore: boolean;
}

const BACKOFF = [2000, 5000, 15000, 60000];
const CHANNEL = 'aikit-sync';
const LOCK = 'aikit-sync';
const PERIODIC_MS = 5 * 60 * 1000;

let channel: BroadcastChannel | null = null;
let status: SyncStatus = 'idle';
let lastSyncAt: string | null = null;
let inFlight = false;
const listeners = new Set<(s: SyncStatus, at: string | null) => void>();

/** 冲突条目：outbox 上传 409 时记录，由界面弹差异对话框。 */
export interface ConflictInfo {
  op: OutboxItem;
  current: unknown; // 服务端最新实体（details.current）
}

let currentConflict: ConflictInfo | null = null;

export function getConflict(): ConflictInfo | null {
  return currentConflict;
}
export function clearConflict(): void {
  currentConflict = null;
  notify();
}

function notify() {
  for (const fn of listeners) fn(status, lastSyncAt);
}

export function onSyncState(fn: (s: SyncStatus, at: string | null) => void): () => void {
  listeners.add(fn);
  fn(status, lastSyncAt);
  return () => listeners.delete(fn);
}

function setStatus(s: SyncStatus) {
  if (status !== s) {
    status = s;
    notify();
  }
}

function broadcast(message: { kind: string }) {
  try {
    channel ??= new BroadcastChannel(CHANNEL);
    channel.postMessage(message);
  } catch {
    /* BroadcastChannel 不可用时跳过（老浏览器） */
  }
}

/** 拉取增量并写入 Dexie。 */
async function pull(): Promise<void> {
  let since = await getMeta<number>('cursor', 0);
  for (let i = 0; i < 100; i++) {
    const page = await api.get<SyncPage>(`/sync?since=${since}&limit=500`);
    await applyPage(page);
    since = page.cursor;
    if (!page.hasMore) break;
  }
  await setMeta('cursor', since);
  lastSyncAt = new Date().toISOString();
  await setMeta('lastSyncAt', lastSyncAt);
}

async function applyPage(page: SyncPage): Promise<void> {
  await db.transaction(
    'rw',
    db.entries,
    db.stacks,
    db.types,
    db.platforms,
    db.proposals,
    async () => {
      for (const e of page.entries) await db.entries.put(e as never);
      for (const s of page.stacks) await db.stacks.put(s as never);
      for (const t of page.types) await db.types.put(t as never);
      for (const p of page.platforms) await db.platforms.put(p as never);
      for (const pr of page.proposals) await db.proposals.put(pr as never);

      // 同步里已删除的提案不再出现在 pending 列表 → 本地清掉已决策的
      if (page.proposals.length === 0) {
        // 保守：只删除明确不在 pending 的
      }
      for (const id of page.deleted.entries) await db.entries.delete(id);
      for (const id of page.deleted.stacks) await db.stacks.delete(id);
      for (const id of page.deleted.types) await db.types.delete(id);
      for (const id of page.deleted.platforms) await db.platforms.delete(id);
    },
  );
}

/** 上传 outbox 的一条；返回是否成功（已消费）。 */
async function uploadOne(item: OutboxItem): Promise<'done' | 'conflict' | 'invalid' | 'retry'> {
  const ifMatch = item.baseVersion != null ? `"${item.baseVersion}"` : undefined;
  try {
    switch (item.op) {
      case 'createEntry':
        await api.post('/entries', item.body, item.idempotencyKey ?? undefined);
        break;
      case 'updateEntry':
        await api.put(`/entries/${item.entityId}`, item.body, ifMatch);
        break;
      case 'patchEntry':
        await api.patch(`/entries/${item.entityId}`, item.body, ifMatch);
        break;
      case 'deleteEntry':
        await api.delete(`/entries/${item.entityId}`, ifMatch);
        break;
      case 'capture':
        await api.post('/capture', item.body, item.idempotencyKey ?? undefined);
        break;
      case 'stackWrite':
        if (item.entityId) await api.put(`/stacks/${item.entityId}`, item.body, ifMatch);
        else await api.post('/stacks', item.body, item.idempotencyKey ?? undefined);
        break;
      case 'stackDelete':
        await api.delete(`/stacks/${item.entityId}`, ifMatch);
        break;
      case 'stackEntries':
        await api.put(`/stacks/${item.entityId}/entries`, item.body);
        break;
      case 'rules':
        await api.put('/settings/rules', item.body);
        break;
    }
    return 'done';
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 409) {
        const current = (err.details[0] as { current?: unknown } | undefined)?.current;
        currentConflict = { op: item, current };
        setStatus('conflict');
        return 'conflict';
      }
      if (err.status === 422) return 'invalid'; // 校验/密钥扫描失败：撤销本地修改
      return 'retry';
    }
    return 'retry';
  }
}

/** 顺序上传整个 outbox。 */
async function flushOutbox(): Promise<void> {
  for (;;) {
    const item = await db.outbox.orderBy('seq').first();
    if (!item) return;
    const result = await uploadOne(item);
    if (result === 'done' || result === 'invalid') {
      await db.outbox.delete(item.seq!);
      if (result === 'invalid') {
        // 422：撤销这次本地修改（重拉该实体）——由调用方在 sync 完成后重拉
      }
    } else if (result === 'conflict') {
      // 保留在 outbox 并标记，等用户在冲突对话框里决定
      await db.outbox.update(item.seq!, { lastError: 'conflict' });
      return; // 停止后续上传，避免乱序
    } else {
      // 网络错误：退避重试
      const retries = item.retries + 1;
      const delay = retries < BACKOFF.length ? BACKOFF[retries - 1] : BACKOFF[BACKOFF.length - 1];
      await db.outbox.update(item.seq!, { retries, lastError: 'network' });
      scheduleRetry(delay);
      return;
    }
  }
}

let retryTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleRetry(delayMs: number) {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void sync();
  }, delayMs);
}

/** 等待正在进行的同步结束后，再执行一次拉取。 */
export async function syncSoon(): Promise<void> {
  if (!inFlight) {
    await sync();
    return;
  }
  await new Promise<void>((resolve) => {
    const stop = onSyncState((status) => {
      if (status === 'idle' || status === 'offline') {
        stop();
        setTimeout(() => {
          void sync().finally(resolve);
        }, 50);
      }
    });
  });
}

/** 一次完整同步：Web Locks 保证同一时间只有一个标签页在同步。 */
export async function sync(): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;
  try {
    if (offline) {
      setStatus('offline');
      return;
    }
    setStatus('syncing');
    const run = async () => {
      try {
        await flushOutbox();
        await pull();
        if (status === 'conflict' && !currentConflict) setStatus('idle');
        else if (status !== 'conflict') setStatus('idle');
        broadcast({ kind: 'synced' });
      } catch (err) {
        if (err instanceof ApiError && err.status === 0) setStatus('offline');
        else setStatus('offline'); // 网络错误统一归为离线，退避重试
        scheduleRetry(BACKOFF[0]);
      }
    };
    if (typeof navigator !== 'undefined' && navigator.locks) {
      await navigator.locks.request(LOCK, run);
    } else {
      await run();
    }
  } finally {
    inFlight = false;
  }
}

/** 写操作：先乐观更新本地（调用方做），再入 outbox 并尝试上传。 */
export async function enqueueOutbox(
  item: Omit<OutboxItem, 'createdAt' | 'retries' | 'lastError'>,
): Promise<void> {
  await db.outbox.add({
    ...item,
    createdAt: new Date().toISOString(),
    retries: 0,
    lastError: null,
  });
  void sync();
}

/** 新建本地条目的离线 id + 幂等键（03-api#离线新建）。 */
export function offlineId(): { id: string; idempotencyKey: string } {
  const id = ulid();
  return { id, idempotencyKey: id };
}

/** 监听其他标签页的写入广播，从 Dexie 重新读取。 */
export function crossTabSync(onRefresh: () => void): () => void {
  try {
    channel ??= new BroadcastChannel(CHANNEL);
    const handler = (ev: MessageEvent) => {
      if ((ev.data as { kind?: string })?.kind === 'synced') onRefresh();
    };
    channel.addEventListener('message', handler);
    return () => channel?.removeEventListener('message', handler);
  } catch {
    return () => undefined;
  }
}

/** 启动同步：拉取时机见 04-frontend（启动、可见、联网、每 5 分钟、上传成功后）。 */
export function startAutoSync(): () => void {
  void sync();
  const onVisible = () => {
    if (document.visibilityState === 'visible') void sync();
  };
  const onOnline = () => void sync();
  const timer = setInterval(() => {
    if (document.visibilityState === 'visible') void sync();
  }, PERIODIC_MS);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', onOnline);
  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('online', onOnline);
  };
}

export async function lastSyncTime(): Promise<string | null> {
  return getMeta<string | null>('lastSyncAt', null);
}

export async function pendingCount(): Promise<number> {
  return db.outbox.count();
}
