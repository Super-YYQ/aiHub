// 数据仓库：启动时从 Dexie 读取，写入走乐观更新 + outbox（见 lib/sync）。
import { defineStore } from 'pinia';
import { toRaw } from 'vue';
import type { Entry, Stack, TypeDict, PlatformDict, Proposal, StackRef } from '@aikit/shared';
import { db } from '../lib/db';
import { enqueueOutbox, offlineId, sync } from '../lib/sync';

/** 去响应式的深拷贝：IndexedDB 的结构化克隆无法处理 reactive 代理里的特殊成员。 */
function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(toRaw(value))) as T;
}

export const useEntriesStore = defineStore('entries', {
  state: () => ({
    entries: [] as Entry[],
    loaded: false,
  }),
  getters: {
    byId: (s) => (id: string) => s.entries.find((e) => e.id === id),
    live: (s) => s.entries.filter((e) => e.status !== 'archived'),
    inbox: (s) => s.entries.filter((e) => e.status === 'inbox'),
    pinned: (s) => s.entries.filter((e) => e.pinned),
  },
  actions: {
    async load() {
      this.entries = await db.entries.toArray();
      this.loaded = true;
    },
    async create(draft: Record<string, unknown>, offlineCreated = false) {
      const { id, idempotencyKey } = offlineId();
      const now = new Date().toISOString();
      const entry: Entry = plain({
        ...(draft as object),
        id,
        version: 1,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        stacks: (draft.stacks as StackRef[]) ?? [],
      }) as Entry;
      await db.entries.put(entry);
      this.entries = await db.entries.toArray();
      await enqueueOutbox({
        op: 'createEntry',
        entityId: offlineCreated ? id : null,
        body: plain({ ...draft, id }),
        baseVersion: null,
        idempotencyKey,
      });
      return entry;
    },
    async update(id: string, body: Record<string, unknown>) {
      const current = this.byId(id);
      if (!current) return;
      const updated: Entry = {
        ...plain(current),
        ...plain(body),
        version: current.version + 1,
        updatedAt: new Date().toISOString(),
      };
      await db.entries.put(updated);
      this.entries = await db.entries.toArray();
      await enqueueOutbox({
        op: 'updateEntry',
        entityId: id,
        body,
        baseVersion: current.version,
        idempotencyKey: null,
      });
      return updated;
    },
    async patch(
      id: string,
      patch: { status?: Entry['status']; pinned?: boolean; rating?: number },
    ) {
      const current = this.byId(id);
      if (!current) return;
      const updated: Entry = {
        ...plain(current),
        ...patch,
        version: current.version + 1,
        updatedAt: new Date().toISOString(),
      };
      await db.entries.put(updated);
      this.entries = await db.entries.toArray();
      await enqueueOutbox({
        op: 'patchEntry',
        entityId: id,
        body: patch,
        baseVersion: current.version,
        idempotencyKey: null,
      });
      return updated;
    },
    async remove(id: string) {
      const current = this.byId(id);
      if (!current) return;
      // 乐观删除本地；outbox 传给服务端（软删除后同步会再次确认）
      this.entries = this.entries.filter((e) => e.id !== id);
      await db.entries.delete(id);
      await enqueueOutbox({
        op: 'deleteEntry',
        entityId: id,
        body: null,
        baseVersion: current.version,
        idempotencyKey: null,
      });
    },
    async capture(type: string, text: string, sourceUrl?: string) {
      await enqueueOutbox({
        op: 'capture',
        entityId: null,
        body: { type, text, ...(sourceUrl ? { sourceUrl } : {}) },
        baseVersion: null,
        idempotencyKey: offlineId().idempotencyKey,
      });
      // 乐观：立即拉取（在线时服务端已生成）；离线时列表在下次同步后出现
      void sync();
    },
    async refresh() {
      this.entries = await db.entries.toArray();
    },
  },
});

export const useStacksStore = defineStore('stacks', {
  state: () => ({
    stacks: [] as Array<Stack & { entryCount?: number }>,
    loaded: false,
  }),
  actions: {
    async load() {
      this.stacks = await db.stacks.toArray();
      this.loaded = true;
    },
    async create(body: Record<string, unknown>) {
      await enqueueOutbox({
        op: 'stackWrite',
        entityId: null,
        body,
        baseVersion: null,
        idempotencyKey: offlineId().idempotencyKey,
      });
      void sync();
    },
    async update(id: string, body: Record<string, unknown>) {
      const current = this.stacks.find((s) => s.id === id);
      await enqueueOutbox({
        op: 'stackWrite',
        entityId: id,
        body,
        baseVersion: current?.version ?? null,
        idempotencyKey: null,
      });
      void sync();
    },
    async remove(id: string) {
      const current = this.stacks.find((s) => s.id === id);
      await enqueueOutbox({
        op: 'stackDelete',
        entityId: id,
        body: null,
        baseVersion: current?.version ?? null,
        idempotencyKey: null,
      });
      void sync();
    },
    async setEntries(
      id: string,
      body: { add: Array<{ entryId: string; note?: string }>; remove: string[] },
    ) {
      await enqueueOutbox({
        op: 'stackEntries',
        entityId: id,
        body,
        baseVersion: null,
        idempotencyKey: null,
      });
      void sync();
    },
    async refresh() {
      this.stacks = await db.stacks.toArray();
    },
  },
});

export const useDictionariesStore = defineStore('dictionaries', {
  state: () => ({
    types: [] as TypeDict[],
    platforms: [] as PlatformDict[],
    rules: '',
  }),
  actions: {
    async load() {
      this.types = await db.types.toArray();
      this.platforms = await db.platforms.toArray();
      try {
        const { api } = await import('../lib/api');
        this.rules = await api.getRules();
      } catch {
        /* 离线时保持上次值 */
      }
    },
    typeName(id: string): string {
      return this.types.find((t) => t.id === id)?.name ?? id;
    },
    typeColor(id: string): string {
      return this.types.find((t) => t.id === id)?.color ?? '#56626f';
    },
    platformName(id: string): string {
      return this.platforms.find((p) => p.id === id)?.name ?? id;
    },
  },
});

export const useProposalsStore = defineStore('proposals', {
  state: () => ({
    proposals: [] as Proposal[],
  }),
  getters: {
    pending: (s) => s.proposals.filter((p) => p.status === 'pending'),
  },
  actions: {
    async load() {
      this.proposals = await db.proposals.toArray();
    },
  },
});
