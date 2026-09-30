// Dexie 本地库：与服务端实体同形；outbox 与 meta 见 04-frontend#状态与离线同步。
import Dexie, { type EntityTable } from 'dexie';
import type { Entry, Stack, TypeDict, PlatformDict, Proposal } from '@aikit/shared';

export interface OutboxItem {
  seq?: number; // 自增
  op:
    | 'createEntry'
    | 'updateEntry'
    | 'patchEntry'
    | 'deleteEntry'
    | 'capture'
    | 'stackWrite'
    | 'stackDelete'
    | 'stackEntries'
    | 'rules';
  entityId: string | null;
  body: unknown;
  baseVersion: number | null; // 更新/删除时的 If-Match 来源
  idempotencyKey: string | null;
  createdAt: string;
  retries: number;
  lastError: string | null;
}

export interface Meta {
  key: string;
  value: unknown;
}

export interface LocalDb extends Dexie {
  entries: EntityTable<Entry, 'id'>;
  stacks: EntityTable<Stack, 'id'>;
  types: EntityTable<TypeDict, 'id'>;
  platforms: EntityTable<PlatformDict, 'id'>;
  proposals: EntityTable<Proposal, 'id'>;
  outbox: EntityTable<OutboxItem, 'seq'>;
  meta: EntityTable<Meta, 'key'>;
}

export function createDb(): LocalDb {
  const db = new Dexie('ai-kit') as LocalDb;
  db.version(1).stores({
    entries: 'id, type, status, updatedAt, *tags',
    stacks: 'id, name',
    types: 'id, sort',
    platforms: 'id, sort',
    proposals: 'id, status',
    outbox: '++seq, entityId, createdAt',
    meta: 'key',
  });
  return db;
}

export const db = createDb();

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await db.meta.get(key);
  return (row?.value as T) ?? fallback;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}
