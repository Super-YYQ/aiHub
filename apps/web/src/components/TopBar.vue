<script setup lang="ts">
// 顶部栏：标题、搜索入口、外观切换、返回按钮（原型 topbar）。
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useUiStore } from '../stores/ui';
import { useDictionariesStore } from '../stores/data';
import { STATUSES, STATUS_NAMES } from '@aikit/shared';

const route = useRoute();
const router = useRouter();
const ui = useUiStore();
const dicts = useDictionariesStore();

const title = computed(() => {
  switch (route.name) {
    case 'home':
      return '工作台';
    case 'list':
      return scopeName(String(route.params.scope ?? 'all'));
    case 'new':
      return '新建条目';
    case 'edit':
      return '编辑条目';
    case 'stacks':
      return '我的环境';
    case 'stack':
      return '环境';
    case 'stack-new':
      return '新建环境';
    case 'stack-edit':
      return '编辑环境';
    case 'proposals':
      return '待确认';
    case 'settings':
      return '数据与设置';
    default:
      return 'AI 工作台';
  }
});

function scopeName(scope: string): string {
  if (scope === 'all') return '全部条目';
  if (scope === 'pinned') return '置顶';
  if ((STATUSES as readonly string[]).includes(scope))
    return STATUS_NAMES[scope as keyof typeof STATUS_NAMES];
  const t = dicts.types.find((x: { id: string }) => x.id === scope);
  return t?.name ?? scope;
}

const showBack = computed(() =>
  ['edit', 'new', 'stack-new', 'stack-edit', 'stack', 'settings'].includes(String(route.name)),
);

function goBack() {
  switch (route.name) {
    case 'edit':
      router.push(`/list/all/${route.params.id}`);
      break;
    case 'new':
      router.push('/');
      break;
    case 'stack':
      router.push('/stacks');
      break;
    case 'stack-new':
      router.push('/stacks');
      break;
    case 'stack-edit':
      router.push(`/stacks/${route.params.id}`);
      break;
    default:
      router.push('/');
  }
}
</script>

<template>
  <header class="topbar">
    <button v-if="showBack" class="btn btn-sm" type="button" @click="goBack">← 返回</button>
    <span class="title">{{ title }}</span>
    <button class="search-trigger" type="button" @click="$emit('open-search')">
      搜索名称、命令或提示词内容 <kbd>Ctrl K</kbd>
    </button>
    <button class="btn" type="button" @click="$emit('open-appearance')">外观</button>
    <button class="btn" type="button" @click="ui.toggleTheme()" aria-label="切换深浅色">◐</button>
  </header>
</template>
