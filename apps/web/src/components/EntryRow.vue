<script setup lang="ts">
// 条目行（列表/工作台/面板共用，原型 row）。
import type { Entry } from '@aikit/shared';
import { statusName } from '../lib/display';

defineProps<{ entry: Entry; current?: boolean }>();
</script>

<template>
  <router-link
    class="row"
    :data-type="entry.type"
    :to="`/list/all/${entry.id}`"
    :aria-current="current ? 'true' : undefined"
  >
    <span class="row-head">
      <span class="path" :data-type="entry.type">
        <b>{{ entry.type }}</b>/{{ entry.slug }}</span>
      <span v-if="entry.pinned" class="pin" title="已置顶">置顶</span>
      <span class="st" :class="`st-${entry.status}`">{{ statusName(entry.status) }}</span>
    </span>
    <span class="row-title">{{ entry.title }}</span>
    <span v-if="entry.summary" class="row-summary">{{ entry.summary }}</span>
  </router-link>
</template>

<style scoped>
.row {
  position: relative;
  display: grid;
  gap: 2px;
  padding: 12px 16px 12px 20px;
  border-bottom: 1px solid var(--line);
  cursor: pointer;
  text-decoration: none;
  color: inherit;
}
.row::before {
  content: '';
  position: absolute;
  left: 0;
  top: 12px;
  bottom: 12px;
  width: 4px;
  border-radius: 0 2px 2px 0;
  background: var(--tc);
}
.row:hover {
  background: var(--soft);
}
.row[aria-current='true'] {
  background: var(--surface);
}
.row-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.row-title {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row-head .st {
  margin-left: auto;
}
.row-summary {
  color: var(--muted);
  font-size: 13px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.pin {
  color: var(--ink);
  font-size: 12px;
}
</style>
