<script setup lang="ts">
// 类型标签（原型 typeTabs）：结构与结构 2/3 共用。
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useEntriesStore, useDictionariesStore } from '../stores/data';

const route = useRoute();
const entries = useEntriesStore();
const dicts = useDictionariesStore();

const current = computed(() =>
  route.name === 'list' ? String(route.params.scope ?? 'all') : 'all',
);
const live = computed(() => entries.entries.filter((e) => e.status !== 'archived'));
</script>

<template>
  <nav class="type-tabs" aria-label="按类型">
    <router-link to="/list/all" :aria-current="current === 'all' ? 'page' : undefined">
      全部<span class="count">{{ live.length }}</span>
</router-link>
    <router-link
      v-for="t in dicts.types"
      :key="t.id"
      :to="`/list/${t.id}`"
      :data-type="t.id"
      :aria-current="current === t.id ? 'page' : undefined"
    >
      <span class="swatch" :data-type="t.id"></span>{{ t.name
      }}<span class="count">{{ live.filter((e) => e.type === t.id).length }}</span>
    </router-link>
  </nav>
</template>

<style scoped>
.type-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.type-tabs a {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--ink);
  text-decoration: none;
  font-size: 13px;
}
.type-tabs a[aria-current='page'] {
  border-color: var(--ink);
  font-weight: 600;
}
.type-tabs .count {
  font-size: 12px;
  color: var(--muted);
}
</style>
