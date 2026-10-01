<script setup lang="ts">
// 结构 3 搜索优先（原型 renderLauncher）：大搜索框、左结果右预览、方向键+回车复制。
import { computed, ref, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { searchEntries, highlightSegments, tokenize, applyVariables } from '@aikit/shared';
import { useEntriesStore } from '../../stores/data';
import { useUiStore } from '../../stores/ui';
import { scopeEntries, statusName } from '../../lib/display';
import TypeTabs from '../../components/TypeTabs.vue';
import EntryDetail from '../../components/EntryDetail.vue';

const route = useRoute();
const router = useRouter();
const entries = useEntriesStore();
const ui = useUiStore();

const scope = computed(() => String(route.params.scope ?? 'all'));
const selectedId = computed(() => (route.params.id ? String(route.params.id) : null));
const q = ref('');
const sel = ref<string | null>(null);
const input = ref<HTMLInputElement | null>(null);

const pool = computed(() => scopeEntries(entries.entries, scope.value));
const terms = computed(() => tokenize(q.value.trim()));

const items = computed(() => {
  if (terms.value.length) {
    const ids = new Set(pool.value.map((e) => e.id));
    return searchEntries(entries.entries, q.value.trim(), { limit: 30 }).filter((e) =>
      ids.has(e.id),
    );
  }
  const pinnedFirst = pool.value.filter((e) => e.pinned);
  const rest = pool.value.filter((e) => !e.pinned).slice(0, 12);
  return [...pinnedFirst, ...rest];
});

const current = computed(() => (sel.value ? entries.byId(sel.value) : undefined));
const inboxCount = computed(() => entries.entries.filter((e) => e.status === 'inbox').length);

onMounted(async () => {
  if (selectedId.value) sel.value = selectedId.value;
  else if (items.value.length) sel.value = items.value[0].id;
  // 进入页面自动聚焦（桌面）；手机由点击触发
  await nextTick();
  input.value?.focus({ preventScroll: true });
});
onBeforeUnmount(() => document.removeEventListener('keydown', listKey));
document.addEventListener('keydown', listKey);

function listKey(ev: KeyboardEvent) {
  if (ev.target === input.value) return;
  if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') move(ev.key === 'ArrowDown' ? 1 : -1);
}

function move(delta: number) {
  const n = items.value.length;
  if (!n) return;
  const i = items.value.findIndex((e) => e.id === sel.value);
  sel.value = items.value[(i + delta + n) % n].id;
  document.querySelector(`[data-lid="${sel.value}"]`)?.scrollIntoView({ block: 'nearest' });
}

const highlighted = (text: string) =>
  highlightSegments(text, terms.value)
    .map((seg) => (seg.hit ? `<mark>${esc(seg.text)}</mark>` : esc(seg.text)))
    .join('');
function esc(s: string): string {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&', '<': '<', '>': '>', '"': '"' })[c]!);
}

function onSearchKey(ev: KeyboardEvent) {
  if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
    ev.preventDefault();
    move(ev.key === 'ArrowDown' ? 1 : -1);
  } else if (ev.key === 'Enter') {
    ev.preventDefault();
    const e = current.value;
    if (!e) {
      const text = q.value.trim();
      if (text) void router.push({ path: '/new', query: { title: text } });
      return;
    }
    if (ev.ctrlKey || ev.metaKey) {
      void router.push(`/edit/${e.id}`);
      return;
    }
    const s = e.snippets[0];
    if (s) {
      void navigator.clipboard
        .writeText(applyVariables(s.code, {}))
        .then(() => ui.showToast(`已复制：${e.title}`))
        .catch(() => ui.showToast('复制失败'));
    } else {
      ui.showToast('这个条目没有片段可复制');
    }
  } else if (ev.key === 'Escape') {
    q.value = '';
  }
}
</script>

<template>
  <div class="launcher">
    <label class="l-search">
      <span class="sr-only">搜索档案</span>
      <input
        ref="input"
        v-model="q"
        type="search"
        placeholder="搜索名称、命令或提示词内容"
        autocomplete="off"
        data-testid="launcher-search"
        @keydown="onSearchKey"
      />
    </label>
    <div class="l-meta">
      <TypeTabs />
      <router-link v-if="inboxCount" class="chip" to="/list/inbox">
        待整理 {{ inboxCount }}
      </router-link>
    </div>
    <div class="l-body">
      <ul class="l-results" role="listbox" aria-label="搜索结果" data-testid="launcher-results">
        <li v-if="!terms.length && items.length" class="group" role="presentation">
          置顶与最近更新
        </li>
        <li v-for="e in items" :key="e.id" :data-type="e.type">
          <a
            class="l-item"
            role="option"
            :data-lid="e.id"
            :aria-selected="e.id === sel"
            href="#"
            @click.prevent="sel = e.id"
          >
            <span class="row-head">
              <span class="path" :data-type="e.type"><b>{{ e.type }}</b>/{{ e.slug }}</span>
              <span class="st" :class="`st-${e.status}`">{{ statusName(e.status) }}</span>
            </span>
            <span class="l-title" v-html="highlighted(e.title)"></span>
            <span
              class="l-sub"
              v-html="highlighted(e.summary || (e.snippets[0]?.code ?? '').split('\n')[0])"
            ></span>
          </a>
        </li>
        <li v-if="!items.length" class="group l-empty" role="presentation">
          没有找到“{{ q }}”。按 Enter 用它作为名称新建条目。
        </li>
      </ul>
      <section class="l-preview" aria-label="预览">
        <EntryDetail v-if="current" :key="current.id" :entry="current" @open-history="() => {}" />
        <div v-else class="l-empty">选中一个结果，在这里预览。</div>
      </section>
    </div>
    <div class="l-hints">
      <span><kbd>↑</kbd> <kbd>↓</kbd> 选择</span>
      <span><kbd>Enter</kbd> 复制第一个片段</span>
      <span><kbd>Ctrl Enter</kbd> 编辑</span>
      <span><kbd>Esc</kbd> 清空搜索</span>
    </div>
  </div>
</template>

<style scoped>
.launcher {
  display: grid;
  gap: 14px;
  max-width: 1280px;
  margin: 0 auto;
  padding: 24px 24px 48px;
  height: 100%;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
}
.l-search input {
  width: 100%;
  padding: 16px 18px;
  border: 2px solid var(--line);
  border-radius: var(--r-lg);
  background: var(--surface);
  font-size: 17px;
  outline: none;
}
.l-search input:focus-visible {
  border-color: var(--focus);
}
.l-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}
.l-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
  gap: 18px;
  min-height: 0;
}
.l-results {
  margin: 0;
  padding: 4px;
  list-style: none;
  overflow-y: auto;
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: var(--surface);
}
.l-results .group {
  padding: 8px 10px 2px;
  font-size: 12px;
  color: var(--muted);
}
.l-results li:not(.group) {
  padding: 0 4px;
}
.l-item {
  display: grid;
  gap: 2px;
  padding: 10px 12px;
  border-radius: var(--r-md);
  text-decoration: none;
  color: inherit;
}
.l-item[aria-selected='true'] {
  background: var(--soft);
}
.row-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.row-head .st {
  margin-left: auto;
}
.l-title {
  font-weight: 600;
}
.l-sub {
  color: var(--muted);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.l-results mark {
  background: color-mix(in srgb, var(--t-hook) 28%, transparent);
  color: inherit;
  border-radius: 2px;
}
.l-preview {
  overflow-y: auto;
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: var(--surface);
  padding: 6px;
}
.l-preview :deep(.detail) {
  padding: 20px 24px 40px;
}
.l-hints {
  display: flex;
  gap: 16px;
  color: var(--muted);
  font-size: 12px;
}
.l-empty {
  color: var(--muted);
  padding: 20px;
}
@media (max-width: 860px) {
  .launcher {
    padding: 14px;
  }
  .l-body {
    grid-template-columns: 1fr;
  }
  .l-preview {
    display: none;
  }
}
</style>
