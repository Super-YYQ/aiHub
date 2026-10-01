<script setup lang="ts">
// 手机底部导航（≤860px 显示；原型 tabbar）：工作台、条目、记录、搜索、环境。
import { useRoute } from 'vue-router';
const route = useRoute();
defineEmits<{ capture: []; search: [] }>();

function tab(name: unknown): string | undefined {
  const n = String(name ?? '');
  switch (n) {
    case 'home':
      return 'home';
    case 'list':
    case 'new':
    case 'edit':
      return 'list';
    case 'stacks':
    case 'stack':
    case 'stack-new':
    case 'stack-edit':
    case 'settings':
    case 'settings-types':
    case 'settings-platforms':
    case 'settings-tags':
    case 'proposals':
      return 'stacks';
    default:
      return undefined;
  }
}
</script>

<template>
  <nav class="tabbar" aria-label="底部导航">
    <router-link to="/" :aria-current="tab(route.name) === 'home' ? 'page' : undefined">
      <span class="icon">⌂</span>工作台
    </router-link>
    <router-link to="/list/all" :aria-current="tab(route.name) === 'list' ? 'page' : undefined">
      <span class="icon">☰</span>条目
    </router-link>
    <button type="button" class="add" aria-label="记一笔" @click="$emit('capture')">
      <span class="icon">＋</span>记录
    </button>
    <button type="button" @click="$emit('search')"><span class="icon">⌕</span>搜索</button>
    <router-link to="/stacks" :aria-current="tab(route.name) === 'stacks' ? 'page' : undefined">
      <span class="icon">▤</span>环境
    </router-link>
  </nav>
</template>
