<script setup lang="ts">
// 环境详情（原型 renderStack）：物料清单（移出/备注）、添加条目、安装清单。
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { TYPE_ORDER } from '@aikit/shared';
import { useStacksStore, useEntriesStore, useDictionariesStore } from '../stores/data';
import { useUiStore } from '../stores/ui';
import { statusName } from '../lib/display';
import { api } from '../lib/api';
import { syncSoon } from '../lib/sync';

const route = useRoute();
const stacks = useStacksStore();
const entries = useEntriesStore();
const dicts = useDictionariesStore();
const ui = useUiStore();

const id = computed(() => String(route.params.id));
const stack = computed(() => stacks.stacks.find((s) => s.id === id.value));
const members = computed(() =>
  entries.entries
    .filter((e) => e.stacks.some((r) => r.id === id.value))
    .sort((a, b) => {
      const ra = TYPE_ORDER[a.type] ?? 1000;
      const rb = TYPE_ORDER[b.type] ?? 1000;
      return ra - rb || a.title.localeCompare(b.title, 'zh');
    }),
);

const pickerOpen = ref(false);
const pickerQuery = ref('');
const pickerChecked = ref<Set<string>>(new Set());

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

const candidates = computed(() =>
  entries.entries
    .filter((e) => e.status !== 'archived' && !e.stacks.some((r) => r.id === id.value))
    .filter((e) => {
      const q = pickerQuery.value.trim().toLowerCase();
      if (!q) return true;
      return `${e.title} ${e.type} ${e.summary}`.toLowerCase().includes(q);
    }),
);

function openPicker() {
  pickerChecked.value = new Set();
  pickerQuery.value = '';
  pickerOpen.value = true;
}

async function confirmAdd() {
  const add = [...pickerChecked.value].map((entryId) => ({ entryId, note: '' }));
  if (!add.length) {
    ui.showToast('先勾选要加入的条目');
    return;
  }
  await stacks.setEntries(id.value, { add, remove: [] });
  ui.showToast(`已加入 ${add.length} 个条目`);
  pickerOpen.value = false;
  await entries.refresh();
  void syncSoon();
  await entries.refresh();
}

async function removeMember(entryId: string) {
  const e = entries.byId(entryId);
  await stacks.setEntries(id.value, { add: [], remove: [entryId] });
  ui.showToast(`已从环境移出“${e?.title ?? '条目'}”`);
  void syncSoon();
  await entries.refresh();
}

const checklistText = ref('');
async function generateChecklist() {
  try {
    checklistText.value = await api.getRaw(`/stacks/${id.value}/checklist`);
  } catch {
    ui.showToast('生成安装清单失败');
  }
}

async function copyChecklist() {
  try {
    await navigator.clipboard.writeText(checklistText.value);
    ui.showToast('已复制安装清单');
  } catch {
    ui.showToast('复制失败');
  }
}

function downloadChecklist() {
  const blob = new Blob([checklistText.value], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${stack.value?.name ?? '环境'}-安装清单.md`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function saveNote(entryId: string, note: string) {
  try {
    await fetch(`/api/stacks/${id.value}/entries/${entryId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ note }),
    });
    ui.showToast('已保存备注');
  } catch {
    ui.showToast('保存备注失败');
  }
}
</script>

<template>
  <div v-if="stack" class="page">
    <div class="stack-head">
      <div>
        <h1>{{ stack.name }}</h1>
        <p v-if="stack.description">{{ stack.description }}</p>
        <div class="stack-meta">
          <span class="chip">{{ KIND_NAMES[stack.kind] ?? '未分类' }}</span>
          <span class="chip">{{ OS_NAMES[stack.os] ?? '不限系统' }}</span>
          <span class="chip">{{ members.length }} 个条目</span>
        </div>
      </div>
      <div class="stack-actions">
        <router-link class="btn" :to="`/stacks/${id}/edit`">编辑环境</router-link>
        <button class="btn" type="button" data-testid="stack-add-open" @click="openPicker">
          ＋ 添加条目
        </button>
        <button
          class="btn btn-primary"
          type="button"
          data-testid="stack-checklist"
          @click="generateChecklist"
        >
          生成安装清单
        </button>
      </div>
    </div>

    <div v-if="pickerOpen" class="picker" data-testid="stack-picker">
      <h2>添加条目到这个环境</h2>
      <input
        v-model="pickerQuery"
        type="search"
        placeholder="按名称或类型筛选"
        aria-label="按名称筛选"
      />
      <ul>
        <li v-for="e in candidates" :key="e.id" :data-type="e.type">
          <label>
            <input
              v-model="pickerChecked"
              type="checkbox"
              :value="e.id"
              :data-testid="`picker-${e.id}`"
            />
            <span class="type-badge" :data-type="e.type">{{ dicts.typeName(e.type) }}</span>
            <span>{{ e.title }}</span>
            <span class="path" :data-type="e.type">{{ e.type }}/{{ e.slug }}</span>
          </label>
        </li>
        <li v-if="!candidates.length" class="panel-empty">档案里的条目都已经在这个环境里了。</li>
      </ul>
      <div class="actions">
        <button
          class="btn btn-primary"
          type="button"
          data-testid="stack-add-confirm"
          @click="confirmAdd"
        >
          加入所选
        </button>
        <button class="btn" type="button" @click="pickerOpen = false">取消</button>
      </div>
    </div>

    <table v-if="members.length" class="bom">
      <thead>
        <tr>
          <th scope="col">名称</th>
          <th scope="col">类型</th>
          <th scope="col">状态</th>
          <th scope="col" class="col-path">路径</th>
          <th scope="col">本环境下的备注</th>
          <th scope="col"><span class="sr-only">操作</span></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="e in members" :key="e.id" :data-type="e.type">
          <th scope="row">
            <router-link :to="`/list/all/${e.id}`">{{ e.title }}</router-link>
          </th>
          <td>
            <span class="type-badge" :data-type="e.type">{{ dicts.typeName(e.type) }}</span>
          </td>
          <td>
            <span class="st" :class="`st-${e.status}`">{{ statusName(e.status) }}</span>
          </td>
          <td class="col-path">
            <span class="path" :data-type="e.type">{{ e.type }}/{{ e.slug }}</span>
          </td>
          <td>
            <input
              class="note-input"
              :value="e.stacks.find((r) => r.id === id)?.note ?? ''"
              placeholder="版本、路径差异"
              :data-testid="`note-${e.id}`"
              @change="(ev) => saveNote(e.id, (ev.target as HTMLInputElement).value)"
            />
          </td>
          <td class="act">
            <button
              class="btn btn-sm"
              type="button"
              :data-testid="`stack-remove-${e.id}`"
              @click="removeMember(e.id)"
            >
              移出
            </button>
          </td>
        </tr>
      </tbody>
    </table>
    <div v-else class="panel">
      <div class="panel-empty">
        这个环境还没有条目。点“添加条目”从档案里挑选，或在编辑条目时勾选“所属环境”。
      </div>
    </div>

    <div v-if="checklistText" class="checklist" data-testid="checklist">
      <div class="stack-head">
        <div>
          <h2 style="margin: 0; font-size: 16px">安装清单</h2>
          <p>新机器照着勾，命令来自各条目里标记为“安装命令”的片段。</p>
        </div>
        <div class="stack-actions">
          <button class="btn btn-sm" type="button" @click="copyChecklist">复制</button>
          <button class="btn btn-sm" type="button" @click="downloadChecklist">下载 .md</button>
        </div>
      </div>
      <label class="sr-only" for="checklist-text">安装清单</label>
      <textarea id="checklist-text" readonly :value="checklistText"></textarea>
    </div>
  </div>
  <div v-else class="page">
    <p>找不到这个环境，可能已被删除。<router-link to="/stacks">查看全部环境</router-link></p>
  </div>
</template>

<style scoped>
.stack-head {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}
.stack-head h1 {
  margin: 0;
  font-size: 24px;
}
.stack-head p {
  margin: 4px 0 0;
  color: var(--muted);
}
.stack-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.stack-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-left: auto;
}
.bom {
  width: 100%;
  border-collapse: collapse;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  overflow: hidden;
}
.bom th,
.bom td {
  padding: 9px 14px;
  border-bottom: 1px solid var(--line);
  text-align: left;
  vertical-align: top;
}
.bom thead th {
  font-size: 12px;
  font-weight: 500;
  color: var(--muted);
  background: var(--soft);
}
.bom tbody th {
  font-weight: 600;
}
.bom tbody th a {
  color: var(--ink);
  text-decoration: none;
}
.bom tbody th a:hover {
  text-decoration: underline;
}
.bom .col-path {
  white-space: nowrap;
}
.bom tr:last-child > * {
  border-bottom: 0;
}
.note-input {
  width: 100%;
  min-width: 160px;
  padding: 4px 8px;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: var(--surface);
}
.picker {
  margin-top: 20px;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: var(--surface);
}
.picker h2 {
  margin: 0 0 10px;
  font-size: 16px;
}
.picker input[type='search'] {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--bg);
}
.picker ul {
  max-height: 340px;
  margin: 10px 0 12px;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}
.picker li label {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 6px;
  border-radius: var(--r-md);
  cursor: pointer;
}
.picker li label:hover {
  background: var(--soft);
}
.picker li .path {
  margin-left: auto;
}
.picker .actions {
  display: flex;
  gap: 8px;
}
.checklist {
  margin-top: 24px;
}
.checklist p {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 13px;
}
.checklist textarea {
  width: 100%;
  min-height: 220px;
  padding: 10px;
  font-family: var(--font-mono);
  font-size: 12.5px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
}
.panel {
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
  overflow: hidden;
}
.panel-empty {
  padding: 14px 16px;
  color: var(--muted);
  font-size: 13px;
}
@media (max-width: 860px) {
  .stack-head {
    flex-wrap: wrap;
  }
  .stack-actions {
    margin-left: 0;
  }
  .bom .col-path {
    display: none;
  }
  .picker li .path {
    display: none;
  }
}
</style>
