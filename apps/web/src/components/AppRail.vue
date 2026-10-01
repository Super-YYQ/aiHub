<script setup lang="ts">
// 侧栏：导航 + 类型 + 环境 + 同步状态（原型 rail 结构；样式在 styles/base.css）。
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useEntriesStore, useStacksStore, useDictionariesStore } from '../stores/data';
import { useUiStore } from '../stores/ui';

const route = useRoute();
const entries = useEntriesStore();
const stacks = useStacksStore();
const dicts = useDictionariesStore();
const ui = useUiStore();

const scope = computed(() => (route.name === 'list' ? String(route.params.scope ?? 'all') : null));
const stackId = computed(() =>
  route.name === 'stack' || route.name === 'stack-edit' ? String(route.params.id ?? '') : null,
);

const statusText = computed(() => {
  switch (ui.syncStatus) {
    case 'syncing':
      return '同步中…';
    case 'offline':
      return '离线';
    case 'conflict':
      return '有冲突';
    default:
      return '已同步';
  }
});
</script>

<template>
  <nav class="rail" aria-label="主导航">
    <div class="brand">AI 工作台 <small>私人档案</small></div>
    <div class="nav-group">
      <router-link
        class="nav-item"
        to="/"
        :aria-current="route.name === 'home' ? 'page' : undefined"
      >
        工作台
      </router-link>
      <router-link
        class="nav-item"
        to="/list/all"
        :aria-current="scope === 'all' ? 'page' : undefined"
      >
        全部条目 <span class="count">{{ entries.live.length }}</span>
      </router-link>
      <router-link
        class="nav-item"
        to="/list/inbox"
        :aria-current="scope === 'inbox' ? 'page' : undefined"
      >
        待整理 <span class="count">{{ entries.inbox.length }}</span>
      </router-link>
      <router-link
        class="nav-item"
        to="/list/pinned"
        :aria-current="scope === 'pinned' ? 'page' : undefined"
      >
        置顶 <span class="count">{{ entries.pinned.length }}</span>
      </router-link>
    </div>
    <div class="nav-group">
      <h2>按类型</h2>
      <router-link
        v-for="t in dicts.types"
        :key="t.id"
        class="nav-item"
        :to="`/list/${t.id}`"
        :data-type="t.id"
        :aria-current="scope === t.id ? 'page' : undefined"
      >
        <span class="swatch" :data-type="t.id"></span>{{ t.name }}
        <span class="count">{{ entries.live.filter((e) => e.type === t.id).length }}</span>
      </router-link>
    </div>
    <div class="nav-group">
      <h2>我的环境</h2>
      <router-link
        v-for="s in stacks.stacks"
        :key="s.id"
        class="nav-item"
        :to="`/stacks/${s.id}`"
        :aria-current="stackId === s.id ? 'page' : undefined"
      >
        {{ s.name }}
      </router-link>
      <router-link class="nav-item" to="/stacks/new">＋ 新建环境</router-link>
      <router-link class="nav-item" to="/proposals">待确认</router-link>
      <router-link class="nav-item" to="/settings">数据与设置</router-link>
    </div>
    <div class="rail-foot">共 {{ entries.entries.length }} 条 · {{ statusText }}</div>
  </nav>
</template>
