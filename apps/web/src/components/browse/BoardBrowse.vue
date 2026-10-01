<script setup lang="ts">
// 结构 4 看板（原型 renderBoard）：按状态/环境/类型分列；按状态时可拖动改状态；待整理列可直接记。
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { STATUSES, STATUS_NAMES } from '@aikit/shared';
import { useEntriesStore, useStacksStore, useDictionariesStore } from '../../stores/data';
import { useUiStore } from '../../stores/ui';
import { statusName, sortPinnedFirst } from '../../lib/display';
import DetailDrawer from '../../components/DetailDrawer.vue';

const route = useRoute();
const router = useRouter();
const entries = useEntriesStore();
const stacks = useStacksStore();
const dicts = useDictionariesStore();
const ui = useUiStore();

const scope = computed(() => String(route.params.scope ?? 'all'));
const selectedId = computed(() => (route.params.id ? String(route.params.id) : null));
const group = ref<'status' | 'stack' | 'type'>('status');
const typeFilter = ref('all');

const scopeType = computed(() =>
  dicts.types.some((t) => t.id === scope.value) ? scope.value : '',
);
const draggable = computed(() => group.value === 'status');

const list = computed(() => {
  const type = scopeType.value || typeFilter.value;
  const base = entries.entries.filter(
    (e) => (type === 'all' || e.type === type) && (draggable.value || e.status !== 'archived'),
  );
  return base;
});

interface Column {
  key: string;
  name: string;
  status?: string;
  type?: string;
  items: typeof entries.entries;
}

const columns = computed<Column[]>(() => {
  if (group.value === 'stack') {
    return [
      ...stacks.stacks.map((s) => ({
        key: `stack-${s.id}`,
        name: s.name,
        items: sortPinnedFirst(list.value.filter((e) => e.stacks.some((r) => r.id === s.id))),
      })),
      {
        key: 'stack-none',
        name: '未加入环境',
        items: sortPinnedFirst(list.value.filter((e) => !e.stacks.length)),
      },
    ];
  }
  if (group.value === 'type') {
    return dicts.types.map((t) => ({
      key: `type-${t.id}`,
      name: t.name,
      type: t.id,
      items: sortPinnedFirst(list.value.filter((e) => e.type === t.id)),
    }));
  }
  return STATUSES.map((s) => ({
    key: `status-${s}`,
    name: STATUS_NAMES[s],
    status: s,
    items: sortPinnedFirst(list.value.filter((e) => e.status === s)),
  }));
});

async function drop(ev: DragEvent, col: Column) {
  if (!col.status) return;
  const entryId = ev.dataTransfer?.getData('text/plain');
  const e = entries.byId(entryId ?? '');
  if (!e || e.status === col.status) return;
  await entries.patch(e.id, { status: col.status as never });
  ui.showToast(`“${e.title}”改为${statusName(col.status)}`);
}

async function captureInColumn(ev: Event) {
  const form = ev.target as HTMLFormElement;
  const input = form.querySelector('input');
  const t = (input?.value ?? '').trim();
  if (!t) return;
  await entries.capture(captureTypeFor(), t);
  ui.showToast('已存入待整理');
  if (input) input.value = '';
  input?.focus();
}

function captureTypeFor(): string {
  return scopeType.value || typeFilter.value !== 'all'
    ? scopeType.value || typeFilter.value
    : 'tool';
}

function onDragOver(ev: DragEvent, col: Column) {
  if (col.status) ev.preventDefault();
}

function onDragStart(ev: DragEvent, entryId: string) {
  ev.dataTransfer?.setData('text/plain', entryId);
  if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move';
  (ev.target as HTMLElement).classList.add('dragging');
}

function onDragEnd(ev: DragEvent) {
  (ev.target as HTMLElement).classList.remove('dragging');
}
</script>

<template>
  <div class="board-page">
    <div class="board-tools">
      <div class="seg" role="group" aria-label="分组方式">
        <button
          v-for="[k, n] in [
            ['status', '按状态'],
            ['stack', '按环境'],
            ['type', '按类型'],
          ] as const"
          :key="k"
          type="button"
          :aria-pressed="group === k"
          @click="group = k"
        >
          {{ n }}
        </button>
      </div>
      <select v-model="typeFilter" aria-label="只看某个类型" data-testid="board-type">
        <option value="all">全部类型</option>
        <option v-for="t in dicts.types" :key="t.id" :value="t.id">{{ t.name }}</option>
      </select>
      <span class="hint">{{
        draggable ? '把卡片拖到另一列即可修改状态' : '切换到“按状态”后可以拖动卡片改状态'
      }}</span>
    </div>
    <div class="board" data-testid="board">
      <section
        v-for="col in columns"
        :key="col.key"
        class="board-col"
        :data-status="col.status ?? ''"
        :data-testid="`board-col-${col.key}`"
        :aria-label="col.name"
        @dragover="onDragOver($event, col)"
        @drop="drop($event, col)"
      >
        <header>
          <span v-if="col.status" class="st" :class="`st-${col.status}`"></span>
          <span v-else-if="col.type" class="swatch" :data-type="col.type"></span>
          {{ col.name }}<span class="count">{{ col.items.length }}</span>
        </header>
        <div class="col-body">
          <form v-if="col.status === 'inbox'" autocomplete="off" @submit.prevent="captureInColumn">
            <label class="sr-only" for="col-cap">记一笔</label>
            <input id="col-cap" placeholder="记一笔，回车存入待整理" data-testid="board-capture" />
          </form>
          <article
            v-for="e in col.items"
            :key="e.id"
            class="bcard"
            :data-type="e.type"
            :data-id="e.id"
            :draggable="draggable"
            :data-testid="`board-card-${e.id}`"
            @dragstart="onDragStart($event, e.id)"
            @dragend="onDragEnd($event)"
          >
            <router-link
              class="card-link"
              :to="`/list/${scope}/${e.id}`"
              :aria-label="`查看 ${e.title}`"
              draggable="false"
            ></router-link>
            <span class="b-top">
              <span class="type-badge" :data-type="e.type">{{ dicts.typeName(e.type) }}</span>
              <span class="st" :class="`st-${e.status}`">{{ statusName(e.status) }}</span>
            </span>
            <span class="b-title">{{ e.title }}</span>
            <span v-if="e.summary" class="b-sub">{{ e.summary }}</span>
          </article>
          <div v-if="!col.items.length" class="col-empty">这一列还没有条目</div>
        </div>
      </section>
    </div>
    <DetailDrawer v-if="selectedId" :entry-id="selectedId" @close="router.push(`/list/${scope}`)" />
  </div>
</template>

<style scoped>
.board-page {
  padding: 20px 24px 48px;
}
.board-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.seg {
  display: flex;
  border: 1px solid var(--line);
  border-radius: 999px;
  overflow: hidden;
}
.seg button {
  padding: 5px 14px;
  border: 0;
  background: none;
  font-size: 13px;
  color: var(--muted);
  cursor: pointer;
}
.seg button[aria-pressed='true'] {
  background: var(--ink);
  color: var(--bg);
}
.board-tools select {
  padding: 5px 10px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  font-size: 13px;
}
.hint {
  font-size: 12px;
  color: var(--muted);
}
.board {
  display: flex;
  gap: 14px;
  overflow-x: auto;
  padding-bottom: 12px;
  align-items: flex-start;
}
.board-col {
  flex: 0 0 min(320px, 84vw);
  display: flex;
  flex-direction: column;
  min-height: 160px;
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: color-mix(in srgb, var(--surface) 92%, var(--bg));
}
.board-col.drop {
  border-color: var(--focus);
}
.board-col header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  font-weight: 600;
  font-size: 14px;
  border-bottom: 1px solid var(--line);
}
.board-col .count {
  margin-left: auto;
  font-size: 12px;
  font-weight: 400;
  color: var(--muted);
}
.col-body {
  display: grid;
  gap: 10px;
  padding: 12px;
}
.col-body form input {
  width: 100%;
  padding: 7px 10px;
  border: 1px dashed var(--line);
  border-radius: var(--r-md);
  background: transparent;
  font-size: 13px;
}
.bcard {
  position: relative;
  display: grid;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
  box-shadow: var(--shadow-1, none);
  cursor: grab;
}
.bcard.dragging {
  opacity: 0.5;
}
.card-link {
  position: absolute;
  inset: 0;
  z-index: 0;
  border-radius: inherit;
}
.b-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: relative;
  z-index: 1;
}
.b-title {
  position: relative;
  z-index: 1;
  font-weight: 600;
}
.b-sub {
  position: relative;
  z-index: 1;
  color: var(--muted);
  font-size: 12px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.col-empty {
  padding: 14px;
  text-align: center;
  color: var(--muted);
  font-size: 12px;
}
</style>
