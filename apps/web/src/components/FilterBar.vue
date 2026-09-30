<script setup lang="ts">
// 筛选栏（原型 filters）：状态/平台/标签/排序；筛选按范围分别记忆。
import { computed } from 'vue';
import { STATUSES } from '@aikit/shared';
import { useDictionariesStore, useEntriesStore } from '../stores/data';
import { statusName } from '../lib/display';

const props = defineProps<{ scope: string; showStatus: boolean }>();
const entries = useEntriesStore();
const dicts = useDictionariesStore();

// 筛选记忆：按 scope 分别存（04-frontend）
const filterKey = (name: string) => `aikit.filter.${props.scope}.${name}`;
const stored = (name: string) => localStorage.getItem(filterKey(name)) ?? '';
const store = (name: string, value: string) =>
  value ? localStorage.setItem(filterKey(name), value) : localStorage.removeItem(filterKey(name));

const status = computed({
  get: () => stored('status'),
  set: (v: string) => {
    store('status', v);
    emitChange();
  },
});
const platform = computed({
  get: () => stored('platform'),
  set: (v: string) => {
    store('platform', v);
    emitChange();
  },
});
const tag = computed({
  get: () => stored('tag'),
  set: (v: string) => {
    store('tag', v);
    emitChange();
  },
});
const sort = computed({
  get: () => stored('sort') || 'updated',
  set: (v: string) => {
    store('sort', v === 'updated' ? '' : v);
    emitChange();
  },
});

const tags = computed(() =>
  Array.from(new Set(entries.entries.flatMap((e) => e.tags))).sort((a, b) =>
    a.localeCompare(b, 'zh'),
  ),
);

const hasFilters = computed(() => Boolean(status.value || platform.value || tag.value));

function clearFilters() {
  for (const name of ['status', 'platform', 'tag']) store(name, '');
  emitChange();
}

const emit = defineEmits<{ change: [] }>();
function emitChange() {
  emit('change');
}

defineExpose({
  filters: computed(() => ({
    status: status.value,
    platform: platform.value,
    tag: tag.value,
    sort: sort.value,
  })),
  hasFilters,
  clearFilters,
});
</script>

<template>
  <div class="filters" data-testid="filter-bar">
    <select v-if="showStatus" v-model="status" aria-label="按状态筛选" data-testid="filter-status">
      <option value="">全部状态</option>
      <option v-for="s in STATUSES" :key="s" :value="s">{{ statusName(s) }}</option>
    </select>
    <select v-model="platform" aria-label="按平台筛选" data-testid="filter-platform">
      <option value="">全部平台</option>
      <option v-for="p in dicts.platforms" :key="p.id" :value="p.id">{{ p.name }}</option>
    </select>
    <select v-if="tags.length" v-model="tag" aria-label="按标签筛选">
      <option value="">全部标签</option>
      <option v-for="t in tags" :key="t" :value="t">#{{ t }}</option>
    </select>
    <select v-model="sort" aria-label="排序">
      <option value="updated">最近更新</option>
      <option value="title">按名称</option>
      <option value="rating">按评分</option>
    </select>
    <button
      v-if="hasFilters"
      class="btn btn-sm"
      type="button"
      data-testid="clear-filters"
      @click="clearFilters"
    >
      清除筛选
    </button>
  </div>
</template>

<style scoped>
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--line);
  position: sticky;
  top: 0;
  z-index: 2;
  background: color-mix(in srgb, var(--bg) 88%, transparent);
  backdrop-filter: blur(10px);
}
.filters select {
  padding: 1px 6px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  font-size: 12px;
  color: var(--muted);
}
</style>
