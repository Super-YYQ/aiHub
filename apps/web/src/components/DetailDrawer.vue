<script setup lang="ts">
// 详情抽屉（结构 2/4 共用）：Esc、点遮罩、点关闭都能关闭。
import { onMounted, onBeforeUnmount } from 'vue';
import EntryDetail from './EntryDetail.vue';
import { useEntriesStore } from '../stores/data';
import RevisionDrawer from './RevisionDrawer.vue';
import { ref } from 'vue';

const props = defineProps<{ entryId: string }>();
const emit = defineEmits<{ close: [] }>();
const entries = useEntriesStore();
const entry = () => entries.byId(props.entryId);
const showHistory = ref(false);
const lastFocus = document.activeElement as HTMLElement | null;

function onKey(ev: KeyboardEvent) {
  if (ev.key === 'Escape' && !showHistory.value) emit('close');
}
onMounted(() => document.addEventListener('keydown', onKey));
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey);
  lastFocus?.focus?.();
});
</script>

<template>
  <Teleport to="body">
    <div class="drawer-backdrop" data-testid="detail-drawer" @click.self="emit('close')">
      <aside class="drawer" role="dialog" aria-modal="true" aria-label="条目详情">
        <button class="btn btn-sm drawer-close" type="button" @click="emit('close')">关闭</button>
        <EntryDetail v-if="entry()" :entry="entry()!" @open-history="showHistory = true" />
        <div v-else class="empty">找不到这个条目，可能已被删除。</div>
      </aside>
    </div>
  </Teleport>
  <RevisionDrawer v-if="showHistory" :entry-id="entryId" @close="showHistory = false" />
</template>

<style scoped>
.drawer-backdrop {
  position: fixed;
  inset: 0;
  z-index: 44;
  background: color-mix(in srgb, var(--ink) 30%, transparent);
  animation: fade-in 0.16s ease-out;
}
@keyframes fade-in {
  from {
    opacity: 0;
  }
}
.drawer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(720px, 92vw);
  overflow-y: auto;
  background: var(--surface);
  border-left: 1px solid var(--line);
  box-shadow: -12px 0 40px -16px color-mix(in srgb, var(--ink) 45%, transparent);
  animation: drawer-in 0.2s var(--ease, ease-out);
}
@keyframes drawer-in {
  from {
    transform: translateX(24px);
    opacity: 0;
  }
}
.drawer-close {
  position: absolute;
  top: 12px;
  right: 16px;
  z-index: 1;
}
.empty {
  padding: 40px;
  text-align: center;
  color: var(--muted);
}
@media (max-width: 860px) {
  .drawer {
    width: 100%;
    border-left: 0;
  }
}
</style>
