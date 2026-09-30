<script setup lang="ts">
// 环境列表（原型 renderStacks）。
import { useStacksStore, useEntriesStore } from '../stores/data';

const stacks = useStacksStore();
const entries = useEntriesStore();

const KIND_NAMES: Record<string, string> = {
  pc: '电脑',
  server: '服务器',
  phone: '手机',
  tablet: '平板',
  scene: '使用场景',
};
const OS_NAMES: Record<string, string> = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
  ios: 'iOS',
  android: 'Android',
  any: '不限系统',
};

const meta = (kind: string, os: string) =>
  `${KIND_NAMES[kind] ?? '未分类'}，${OS_NAMES[os] ?? '不限系统'}`;

const memberCount = (stackId: string) =>
  entries.entries.filter((e) => e.stacks.some((r) => r.id === stackId)).length;
</script>

<template>
  <div class="page">
    <div class="stack-head">
      <h2>
        我的环境 <span class="count">{{ stacks.stacks.length }}</span>
      </h2>
      <router-link class="btn" to="/stacks/new">＋ 新建环境</router-link>
    </div>
    <div class="panel">
      <router-link v-for="s in stacks.stacks" :key="s.id" class="row" :to="`/stacks/${s.id}`">
        <span class="row-title">{{ s.name }}</span>
        <span class="row-summary">
          {{ meta(s.kind, s.os) }}，{{ memberCount(s.id) }} 个条目<template v-if="s.description"
            >。{{ s.description }}</template
          >
        </span>
      </router-link>
      <div v-if="!stacks.stacks.length" class="panel-empty">
        还没有环境。新建一个，比如“公司电脑”或“写作场景”。
      </div>
    </div>
    <h2 style="margin-top: 28px">其他</h2>
    <div class="panel">
      <router-link class="row" to="/settings">
        <span class="row-title">数据与设置</span>
        <span class="row-summary">外观、导出、导入、字典、整理规则</span>
      </router-link>
    </div>
  </div>
</template>

<style scoped>
h2 {
  margin: 0 0 10px;
  font-size: 16px;
  font-weight: 600;
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.count {
  font-size: 12px;
  font-weight: 400;
  color: var(--muted);
}
.stack-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.panel {
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
  overflow: hidden;
}
.row {
  display: grid;
  gap: 2px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--line);
  text-decoration: none;
  color: inherit;
}
.row:last-child {
  border-bottom: 0;
}
.row:hover {
  background: var(--soft);
}
.row-title {
  font-weight: 600;
}
.row-summary {
  color: var(--muted);
  font-size: 13px;
}
.panel-empty {
  padding: 14px 16px;
  color: var(--muted);
  font-size: 13px;
}
</style>
