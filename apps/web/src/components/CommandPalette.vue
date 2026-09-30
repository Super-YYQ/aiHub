<script setup lang="ts">
// 命令面板（04-frontend#页面规格）：条目 / 环境 / 操作 三组；Ctrl+Enter 复制第一个片段。
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { searchEntries, highlightSegments, tokenize, applyVariables } from '@aikit/shared';
import { useEntriesStore, useStacksStore } from '../stores/data';
import { useUiStore, type LayoutId, type StyleId } from '../stores/ui';

const emit = defineEmits<{ close: [] }>();
const router = useRouter();
const entries = useEntriesStore();
const stacks = useStacksStore();
const ui = useUiStore();

const q = ref('');
const index = ref(0);
const input = ref<HTMLInputElement | null>(null);
const lastFocus = document.activeElement as HTMLElement | null;

interface Item {
  kind: 'entry' | 'stack' | 'action';
  id?: string;
  label: string;
  sub?: string;
  type?: string;
  status?: string;
  run: () => void;
}

const results = computed<Item[]>(() => {
  const terms = tokenize(q.value.trim());
  const items: Item[] = [];

  const hit = terms.length
    ? searchEntries(entries.entries, q.value.trim(), { limit: 12 })
    : entries.pinned.slice(0, 12);
  for (const e of hit) {
    items.push({
      kind: 'entry',
      id: e.id,
      label: e.title,
      sub: e.summary || (e.snippets[0]?.code ?? '').split('\n')[0],
      type: e.type,
      status: e.status,
      run: () => {
        emit('close');
        void router.push(`/list/all/${e.id}`);
      },
    });
  }
  for (const s of stacks.stacks) {
    if (!terms.length || terms.every((t) => s.name.toLowerCase().includes(t))) {
      items.push({
        kind: 'stack',
        id: s.id,
        label: s.name,
        sub: '环境',
        run: () => {
          emit('close');
          void router.push(`/stacks/${s.id}`);
        },
      });
    }
  }

  const actions: Array<{ label: string; searchOnly?: boolean; run: () => void }> = [
    {
      label: '新建条目',
      run: () => {
        emit('close');
        void router.push('/new');
      },
    },
    {
      label: '打开工作台',
      run: () => {
        emit('close');
        void router.push('/');
      },
    },
    {
      label: '查看待整理',
      run: () => {
        emit('close');
        void router.push('/list/inbox');
      },
    },
    { label: '切换深浅色', run: () => ui.toggleTheme() },
    ...LAYOUT_ACTIONS.map((l) => ({
      label: `切换结构：${l.name}`,
      searchOnly: true,
      run: () => {
        ui.setLayout(l.id as LayoutId);
        ui.showToast(`已切换为结构“${l.name}”`);
      },
    })),
    ...STYLE_ACTIONS.map((s) => ({
      label: `切换配色：${s.name}`,
      searchOnly: true,
      run: () => {
        ui.setStyle(s.id as StyleId);
        ui.showToast(`已切换为“${s.name}”`);
      },
    })),
  ];
  for (const a of actions) {
    if (terms.length ? terms.every((t) => a.label.toLowerCase().includes(t)) : !a.searchOnly) {
      items.push({ kind: 'action', label: a.label, run: a.run });
    }
  }
  return items;
});

const LAYOUT_ACTIONS = [
  { id: 'panes', name: '1 三栏' },
  { id: 'gallery', name: '2 卡片墙' },
  { id: 'launcher', name: '3 搜索优先' },
  { id: 'board', name: '4 看板' },
  { id: 'docs', name: '5 知识库' },
];
const STYLE_ACTIONS = [
  { id: 'soft', name: 'A 柔和' },
  { id: 'calm', name: 'B 沉静' },
  { id: 'glass', name: 'C 夜航' },
];

const groups = computed(() => {
  const out: Array<{ label: string; items: Item[] }> = [];
  for (const kind of ['entry', 'stack', 'action'] as const) {
    const items = results.value.filter((r) => r.kind === kind);
    if (items.length)
      out.push({ label: kind === 'entry' ? '条目' : kind === 'stack' ? '环境' : '操作', items });
  }
  return out;
});

const flat = computed(() => groups.value.flatMap((g) => g.items));

const highlighted = (text: string) =>
  highlightSegments(text, tokenize(q.value.trim()))
    .map((seg) => (seg.hit ? `<mark>${esc(seg.text)}</mark>` : esc(seg.text)))
    .join('');

function esc(s: string): string {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&', '<': '<', '>': '>', '"': '"' })[c]!);
}

async function copyFirstSnippet(item: Item) {
  const entry = entries.entries.find((e) => e.id === item.id);
  const snippet = entry?.snippets[0];
  if (!entry || !snippet) {
    ui.showToast('这个条目没有片段可复制');
    return;
  }
  try {
    await navigator.clipboard.writeText(applyVariables(snippet.code, {}));
    ui.showToast(`已复制：${entry.title}`);
  } catch {
    ui.showToast('复制失败');
  }
}

async function run(copyFirst: boolean) {
  const item = flat.value[index.value];
  if (!item) {
    const text = q.value.trim();
    if (text) {
      emit('close');
      void router.push({ path: '/new', query: { title: text } });
    }
    return;
  }
  if (copyFirst && item.kind === 'entry') {
    await copyFirstSnippet(item);
    emit('close');
    return;
  }
  item.run();
}

function onKey(ev: KeyboardEvent) {
  const n = flat.value.length;
  if ((ev.key === 'ArrowDown' || ev.key === 'ArrowUp') && n) {
    ev.preventDefault();
    index.value = (index.value + (ev.key === 'ArrowDown' ? 1 : n - 1)) % n;
  } else if (ev.key === 'Enter') {
    ev.preventDefault();
    void run(ev.ctrlKey || ev.metaKey);
  } else if (ev.key === 'Escape') {
    ev.preventDefault();
    emit('close');
  }
}

onMounted(() => {
  input.value?.focus();
  document.addEventListener('keydown', docKey);
});
onBeforeUnmount(() => {
  document.removeEventListener('keydown', docKey);
  lastFocus?.focus?.();
});
function docKey(ev: KeyboardEvent) {
  if (ev.key === 'Escape') emit('close');
}
</script>

<template>
  <Teleport to="body">
    <div class="backdrop" @click.self="emit('close')">
      <div class="palette" role="dialog" aria-modal="true" aria-label="搜索">
        <input
          ref="input"
          v-model="q"
          role="combobox"
          aria-expanded="true"
          placeholder="搜索名称、标签、命令或提示词内容"
          @keydown="onKey"
          @input="index = 0"
        />
        <ul role="listbox" aria-label="搜索结果">
          <template v-for="g in groups" :key="g.label">
            <li class="group" role="presentation">{{ g.label }}</li>
            <li
              v-for="item in g.items"
              :key="`${item.kind}-${item.label}-${item.id ?? ''}`"
              role="option"
              :aria-selected="flat[index]?.label === item.label && flat[index]?.kind === item.kind"
              :data-type="item.type"
              @click="item.run()"
            >
              <span v-if="item.type" class="type-badge">{{ '' }}</span>
              <span class="label" v-html="highlighted(item.label)"></span>
              <span v-if="item.status" class="st" :class="`st-${item.status}`">{{ '' }}</span>
              <span class="sub" v-html="item.sub ? highlighted(item.sub) : ''"></span>
            </li>
          </template>
          <li v-if="!flat.length" class="group" role="presentation">
            没有找到“{{ q }}”。按 Enter 用它作为名称新建条目。
          </li>
        </ul>
        <div class="palette-foot">
          <span><kbd>↑</kbd> <kbd>↓</kbd> 选择</span>
          <span><kbd>Enter</kbd> 打开</span>
          <span><kbd>Ctrl Enter</kbd> 复制第一个片段</span>
          <span><kbd>Esc</kbd> 关闭</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 12vh;
  background: color-mix(in srgb, var(--ink) 28%, transparent);
}
.palette {
  width: min(640px, calc(100vw - 24px));
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: var(--surface);
  box-shadow: 0 24px 60px -20px color-mix(in srgb, var(--ink) 45%, transparent);
  overflow: hidden;
}
.palette input {
  width: 100%;
  padding: 14px 16px;
  border: 0;
  border-bottom: 1px solid var(--line);
  background: transparent;
  font-size: 16px;
  outline: none;
}
.palette ul {
  margin: 0;
  padding: 6px;
  list-style: none;
  overflow-y: auto;
}
.palette li {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--r-md);
  cursor: pointer;
}
.palette li[aria-selected='true'] {
  background: var(--soft);
}
.palette li .sub {
  grid-column: 2 / 4;
  font-size: 12px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.palette .group {
  padding: 8px 10px 2px;
  font-size: 12px;
  color: var(--muted);
  cursor: default;
}
.palette mark {
  background: color-mix(in srgb, var(--t-hook) 28%, transparent);
  color: inherit;
  border-radius: 2px;
}
.palette-foot {
  display: flex;
  gap: 14px;
  padding: 8px 14px;
  border-top: 1px solid var(--line);
  font-size: 12px;
  color: var(--muted);
}
</style>
