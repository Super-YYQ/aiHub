<script setup lang="ts">
// 冲突对话框（04-frontend#冲突处理）：逐字段选保留哪边，或整体放弃本地修改。
import { computed, reactive } from 'vue';
import type { Entry } from '@aikit/shared';
import { getConflict, clearConflict } from '../lib/sync';
import { useEntriesStore } from '../stores/data';
import { useUiStore } from '../stores/ui';

const entries = useEntriesStore();

function shorten(value: unknown): string {
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
  return text.length > 80 ? `${text.slice(0, 80)}…` : text || '（空）';
}

const ui = useUiStore();

const conflict = getConflict();
const emit = defineEmits<{ close: [] }>();

const FIELDS: Array<{ key: keyof Entry; label: string }> = [
  { key: 'title', label: '名称' },
  { key: 'summary', label: '说明' },
  { key: 'status', label: '状态' },
  { key: 'pinned', label: '置顶' },
  { key: 'rating', label: '评分' },
  { key: 'tags', label: '标签' },
  { key: 'fields', label: '要点' },
  { key: 'snippets', label: '片段' },
  { key: 'links', label: '链接' },
  { key: 'body', label: '笔记' },
];

const local = computed(() => {
  const body = conflict?.op.body as Partial<Entry> | undefined;
  return body ?? {};
});
const server = computed(() => (conflict?.current as Partial<Entry> | undefined) ?? {});

const choices = reactive<Record<string, 'local' | 'server'>>({});

const diffFields = computed(() =>
  FIELDS.filter((f) => JSON.stringify(local.value[f.key]) !== JSON.stringify(server.value[f.key])),
);

function choose(field: string, side: 'local' | 'server') {
  choices[field] = side;
}

const allChosen = computed(() => diffFields.value.every((f) => choices[f.key as string]));

async function applyChoices() {
  // 以服务端版本为底，套用用户选择保留的本地字段，重新提交
  if (!conflict) return;
  const serverEntry = server.value;
  const merged: Record<string, unknown> = {
    ...serverEntry,
    ...(conflict.op.body as Record<string, unknown>),
  };
  for (const f of diffFields.value) {
    if (choices[f.key as string] === 'server') {
      merged[f.key as string] = server.value[f.key as keyof Entry];
    }
  }
  const serverVersion = (serverEntry as { version?: number }).version ?? 1;
  try {
    await fetch(`/api/entries/${conflict.op.entityId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'If-Match': `"${serverVersion}"` },
      body: JSON.stringify(merged),
    });
    ui.showToast('已按选择合并并保存');
  } catch (err) {
    ui.showToast((err as Error).message ?? '保存失败，请重试');
  }
  clearConflict();
  emit('close');
  const { sync } = await import('../lib/sync');
  await sync();
  await entries.refresh();
}

async function discardLocal() {
  // 放弃本地修改：删掉 outbox 条目，重新拉取
  if (!conflict) return;
  const { db } = await import('../lib/db');
  if (conflict.op.seq != null) await db.outbox.delete(conflict.op.seq);
  clearConflict();
  emit('close');
  const { sync } = await import('../lib/sync');
  await sync();
  await entries.refresh();
  ui.showToast('已放弃本地修改');
}
</script>

<template>
  <Teleport to="body">
    <div class="backdrop">
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="conflict-title">
        <h2 id="conflict-title">内容有冲突</h2>
        <p class="lede">
          这份修改在其他设备上被改过。逐个字段选择保留哪一边；也可以整体放弃本地修改。
        </p>
        <div v-if="!diffFields.length" class="hint">本地与服务端内容一致，可直接放弃本地修改。</div>
        <table v-else class="diff">
          <thead>
            <tr>
              <th scope="col">字段</th>
              <th scope="col">本地（你的修改）</th>
              <th scope="col">服务端（最新）</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="f in diffFields" :key="String(f.key)">
              <th scope="row">{{ f.label }}</th>
              <td
                :class="{ chosen: choices[f.key as string] === 'local' }"
                @click="choose(String(f.key), 'local')"
              >
                <code>{{ shorten(local[f.key]) }}</code>
              </td>
              <td
                :class="{ chosen: choices[f.key as string] === 'server' }"
                @click="choose(String(f.key), 'server')"
              >
                <code>{{ shorten(server[f.key]) }}</code>
              </td>
            </tr>
          </tbody>
        </table>
        <div class="actions">
          <button class="btn" type="button" @click="discardLocal">放弃本地修改</button>
          <button
            class="btn btn-primary"
            type="button"
            :disabled="diffFields.length > 0 && !allChosen"
            data-testid="conflict-apply"
            @click="applyChoices"
          >
            按选择保存
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 46;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: color-mix(in srgb, var(--ink) 34%, transparent);
}
.dialog {
  width: min(720px, 100%);
  max-height: 80vh;
  overflow-y: auto;
  padding: 22px 26px;
  border-radius: var(--r-lg);
  background: var(--surface);
  box-shadow: var(--shadow-pop, 0 24px 60px -20px rgba(0, 0, 0, 0.4));
}
.dialog h2 {
  margin: 0 0 8px;
  font-size: 18px;
}
.lede {
  margin: 0 0 14px;
  color: var(--muted);
  font-size: 13px;
}
.hint {
  color: var(--muted);
  font-size: 13px;
}
.diff {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 14px;
}
.diff th,
.diff td {
  padding: 8px 10px;
  border: 1px solid var(--line);
  text-align: left;
  vertical-align: top;
  font-size: 12px;
}
.diff thead th {
  color: var(--muted);
  background: var(--soft);
  font-weight: 500;
}
.diff tbody td {
  cursor: pointer;
}
.diff tbody td.chosen {
  background: color-mix(in srgb, var(--focus) 16%, transparent);
  box-shadow: inset 0 0 0 1.5px var(--focus);
}
.diff code {
  word-break: break-all;
  font-size: 11px;
}
.actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
</style>
