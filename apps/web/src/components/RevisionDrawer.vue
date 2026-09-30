<script setup lang="ts">
// 历史版本抽屉（WP11 完整对比/恢复；WP7 先提供列表 + 查看快照 + 恢复）。
import { ref, onMounted, onBeforeUnmount } from 'vue';
import type { Entry } from '@aikit/shared';
import { api } from '../lib/api';
import { useEntriesStore } from '../stores/data';
import { useUiStore } from '../stores/ui';
import { relDate } from '../lib/display';

const props = defineProps<{ entryId: string }>();
const emit = defineEmits<{ close: [] }>();
const entries = useEntriesStore();
const ui = useUiStore();

interface Revision {
  version: number;
  actor: string;
  createdAt: string;
}

const revisions = ref<Revision[]>([]);
const snapshot = ref<Entry | null>(null);
const loading = ref(true);
const lastFocus = document.activeElement as HTMLElement | null;

onMounted(async () => {
  document.addEventListener('keydown', onKey);
  try {
    revisions.value = await api.get<Revision[]>(`/entries/${props.entryId}/revisions`);
  } catch {
    ui.showToast('读取历史失败');
  }
  loading.value = false;
});
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey);
  lastFocus?.focus?.();
});

function onKey(ev: KeyboardEvent) {
  if (ev.key === 'Escape') emit('close');
}

async function show(r: Revision) {
  try {
    snapshot.value = await api.get<Entry>(`/entries/${props.entryId}/revisions/${r.version}`);
  } catch {
    ui.showToast('读取快照失败');
  }
}

async function restore(version: number) {
  const entry = entries.byId(props.entryId);
  if (!entry) return;
  try {
    const res = await fetch(`/api/entries/${props.entryId}/restore`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'If-Match': `"${entry.version}"` },
      body: JSON.stringify({ version }),
    });
    if (!res.ok) throw new Error(String(res.status));
    ui.showToast('已恢复该版本');
    emit('close');
  } catch {
    ui.showToast('恢复失败');
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="drawer-backdrop" @click.self="emit('close')">
      <aside class="drawer" role="dialog" aria-modal="true" aria-label="历史版本">
        <header>
          <h2>历史版本</h2>
          <button class="btn btn-sm" type="button" @click="emit('close')">关闭</button>
        </header>
        <div v-if="loading" class="empty">读取中…</div>
        <ul v-else-if="revisions.length" class="rev-list">
          <li
            v-for="r in revisions"
            :key="r.version"
            :class="{ active: snapshot?.version === r.version }"
          >
            <div class="rev-info">
              <strong>v{{ r.version }}</strong>
              <span>{{ r.actor }} · {{ relDate(r.createdAt) }}</span>
            </div>
            <div class="rev-actions">
              <button class="btn btn-sm" type="button" @click="show(r)">查看</button>
              <button class="btn btn-sm" type="button" @click="restore(r.version)">
                恢复此版本
              </button>
            </div>
            <div v-if="snapshot && snapshot.version === r.version" class="snapshot">
              <p class="path">{{ snapshot.type }}/{{ snapshot.slug }}</p>
              <p>
                <strong>{{ snapshot.title }}</strong>
              </p>
              <p v-if="snapshot.summary">{{ snapshot.summary }}</p>
              <p class="path">状态 {{ snapshot.status }} · 评分 {{ snapshot.rating }}</p>
            </div>
          </li>
        </ul>
        <div v-else class="empty">这个条目还没有修订记录。</div>
      </aside>
    </div>
  </Teleport>
</template>

<style scoped>
.drawer-backdrop {
  position: fixed;
  inset: 0;
  z-index: 44;
  background: color-mix(in srgb, var(--ink) 30%, transparent);
}
.drawer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(480px, 92vw);
  background: var(--surface);
  border-left: 1px solid var(--line);
  overflow-y: auto;
  padding: 20px;
  animation: drawer-in 0.24s var(--ease, ease-out);
}
@keyframes drawer-in {
  from {
    transform: translateX(24px);
    opacity: 0;
  }
}
.drawer header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.rev-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.rev-list li {
  padding: 12px 8px;
  border-bottom: 1px solid var(--line);
}
.rev-list li.active {
  background: var(--soft);
}
.rev-info {
  display: flex;
  gap: 10px;
  align-items: baseline;
  margin-bottom: 6px;
}
.rev-info span {
  color: var(--muted);
  font-size: 12px;
}
.rev-actions {
  display: flex;
  gap: 8px;
}
.snapshot {
  margin-top: 10px;
  padding: 10px;
  border: 1px dashed var(--line);
  border-radius: var(--r-md);
  font-size: 13px;
}
.snapshot p {
  margin: 4px 0;
}
.empty {
  color: var(--muted);
  padding: 20px 8px;
}
</style>
