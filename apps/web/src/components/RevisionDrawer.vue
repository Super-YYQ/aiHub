<script setup lang="ts">
// 历史抽屉（WP11 验收）：列出修订 → 选中与当前版本对比 → 字段差异 + 笔记逐行差异 → 恢复。
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import type { Entry } from '@aikit/shared';
import { api } from '../lib/api';
import { useEntriesStore } from '../stores/data';
import { useUiStore } from '../stores/ui';
import { relDate } from '../lib/display';

const props = defineProps<{ entryId: string }>();
const emit = defineEmits<{ close: [] }>();
const entries = useEntriesStore();
const ui = useUiStore();

interface Revision {
  version: number;
  actor: string;
  createdAt: string;
}

const revisions = ref<Revision[]>([]);
const selectedVersion = ref<number | null>(null);
const snapshot = ref<Entry | null>(null);
const loading = ref(true);
const restoring = ref(false);
const lastFocus = document.activeElement as HTMLElement | null;

const current = computed(() => entries.byId(props.entryId));

onMounted(async () => {
  document.addEventListener('keydown', onKey);
  try {
    revisions.value = await api.get<Revision[]>(`/entries/${props.entryId}/revisions`);
  } catch {
    ui.showToast('读取历史失败');
  }
  loading.value = false;
  // 默认选中最新的旧版本
  if (revisions.value.length) await select(revisions.value[0].version);
});
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey);
  lastFocus?.focus?.();
});

function onKey(ev: KeyboardEvent) {
  if (ev.key === 'Escape') emit('close');
}

async function select(version: number) {
  selectedVersion.value = version;
  try {
    snapshot.value = await api.get<Entry>(`/entries/${props.entryId}/revisions/${version}`);
  } catch {
    ui.showToast('读取快照失败');
  }
}

// ---------- 对比 ----------
type Diff =
  | { kind: 'field'; label: string; before: string; after: string }
  | { kind: 'lines'; label: string; before: string[]; after: string };

const FIELD_LABELS: Array<[keyof Entry, string]> = [
  ['title', '名称'],
  ['summary', '说明'],
  ['status', '状态'],
  ['pinned', '置顶'],
  ['rating', '评分'],
  ['type', '类型'],
  ['slug', '标识'],
  ['platforms', '平台'],
  ['tags', '标签'],
  ['fields', '要点'],
  ['snippets', '片段'],
  ['links', '链接'],
  ['stacks', '环境'],
  ['body', '笔记'],
];

function show(value: unknown): string {
  if (value === null || value === undefined) return '（空）';
  if (Array.isArray(value)) return value.length ? JSON.stringify(value) : '（空）';
  if (typeof value === 'object')
    return Object.keys(value as object).length ? JSON.stringify(value) : '（空）';
  if (typeof value === 'boolean') return value ? '是' : '否';
  return String(value);
}

const diffs = computed<Diff[]>(() => {
  const snap = snapshot.value;
  const cur = current.value;
  if (!snap || !cur) return [];
  const out: Diff[] = [];
  for (const [key, label] of FIELD_LABELS) {
    const before = show(snap[key]);
    const after = show(cur[key]);
    if (before !== after) {
      if (key === 'body') {
        out.push({
          kind: 'lines',
          label,
          before: String(snap.body ?? '').split('\n'),
          after: String(cur.body ?? ''),
        });
      } else {
        out.push({ kind: 'field', label, before, after });
      }
    }
  }
  return out;
});

// 笔记逐行差异：旧行里不在新文本的算删除，新行里不在旧文本的算新增
const bodyLines = computed(() => {
  const d = diffs.value.find((x) => x.kind === 'lines');
  if (!d || d.kind !== 'lines') return { removed: [] as string[], added: [] as string[] };
  const afterSet = new Set(d.after.split('\n'));
  const beforeSet = new Set(d.before);
  return {
    removed: d.before.filter((l) => !afterSet.has(l) && l.trim()),
    added: d.after.split('\n').filter((l) => !beforeSet.has(l) && l.trim()),
  };
});

async function restore() {
  if (!selectedVersion.value || !current.value || restoring.value) return;
  restoring.value = true;
  try {
    const res = await fetch(`/api/entries/${props.entryId}/restore`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'If-Match': `"${current.value.version}"` },
      body: JSON.stringify({ version: selectedVersion.value }),
    });
    if (!res.ok) throw new Error(String(res.status));
    ui.showToast('已恢复该版本（生成新修订）');
    emit('close');
  } catch {
    ui.showToast('恢复失败，请重试');
  }
  restoring.value = false;
}
</script>

<template>
  <Teleport to="body">
    <div class="drawer-backdrop" @click.self="emit('close')">
      <aside
        class="drawer"
        role="dialog"
        aria-modal="true"
        aria-label="历史版本"
        data-testid="revision-drawer"
      >
        <header>
          <h2>历史版本</h2>
          <button class="btn btn-sm" type="button" @click="emit('close')">关闭</button>
        </header>
        <div v-if="loading" class="empty">读取中…</div>
        <template v-else>
          <div class="body-grid">
            <ul class="rev-list" data-testid="revision-list">
              <li
                v-for="r in revisions"
                :key="r.version"
                :class="{ active: selectedVersion === r.version }"
              >
                <button
                  type="button"
                  class="rev-row"
                  :data-testid="`revision-${r.version}`"
                  @click="select(r.version)"
                >
                  <strong>v{{ r.version }}</strong>
                  <span>{{ relDate(r.createdAt) }}</span>
                </button>
              </li>
              <li v-if="!revisions.length" class="empty">这个条目还没有修订记录。</li>
            </ul>
            <div class="diff-pane">
              <template v-if="snapshot && selectedVersion">
                <h3>v{{ selectedVersion }} 与当前（v{{ current?.version }}）的差异</h3>
                <div v-if="!diffs.length" class="empty">两个版本完全一致。</div>
                <table v-else class="diff-table" data-testid="diff-table">
                  <tbody>
                    <template v-for="d in diffs" :key="d.label">
                      <tr v-if="d.kind === 'field'">
                        <th scope="row">{{ d.label }}</th>
                        <td class="before">{{ d.before }}</td>
                        <td class="after">{{ d.after }}</td>
                      </tr>
                      <tr v-else>
                        <th scope="row">{{ d.label }}</th>
                        <td colspan="2" class="lines">
                          <div v-for="l in bodyLines.removed" :key="`r-${l}`" class="line removed">
                            - {{ l }}
                          </div>
                          <div v-for="l in bodyLines.added" :key="`a-${l}`" class="line added">
                            + {{ l }}
                          </div>
                        </td>
                      </tr>
                    </template>
                  </tbody>
                </table>
                <div class="actions">
                  <button
                    class="btn btn-primary"
                    type="button"
                    :disabled="restoring"
                    data-testid="restore-button"
                    @click="restore"
                  >
                    {{ restoring ? '恢复中…' : '恢复此版本' }}
                  </button>
                  <span class="hint">恢复会生成一个新修订，旧版本仍保留在列表里。</span>
                </div>
              </template>
              <div v-else class="empty">从左侧选择一个修订查看差异。</div>
            </div>
          </div>
        </template>
      </aside>
    </div>
  </Teleport>
</template>

<style scoped>
.drawer-backdrop {
  position: fixed;
  inset: 0;
  z-index: 44;
  background: color-mix(in srgb, var(--ink) 30%, transparent);
}
.drawer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(760px, 94vw);
  background: var(--surface);
  border-left: 1px solid var(--line);
  overflow-y: auto;
  padding: 20px;
  animation: drawer-in 0.24s var(--ease, ease-out);
}
@keyframes drawer-in {
  from {
    transform: translateX(24px);
    opacity: 0;
  }
}
.drawer header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.body-grid {
  display: grid;
  grid-template-columns: 200px minmax(0, 1fr);
  gap: 18px;
}
.rev-list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  overflow: hidden;
}
.rev-list li + li {
  border-top: 1px solid var(--line);
}
.rev-row {
  display: flex;
  gap: 10px;
  align-items: baseline;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  background: none;
  cursor: pointer;
  text-align: left;
  color: inherit;
}
.rev-row span {
  color: var(--muted);
  font-size: 12px;
}
.rev-list li.active .rev-row {
  background: var(--soft);
  font-weight: 600;
}
.diff-pane h3 {
  margin: 0 0 12px;
  font-size: 14px;
}
.diff-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 16px;
  table-layout: fixed;
}
.diff-table th,
.diff-table td {
  border: 1px solid var(--line);
  padding: 8px 10px;
  font-size: 12px;
  text-align: left;
  vertical-align: top;
  word-break: break-all;
}
.diff-table th {
  width: 5em;
  color: var(--muted);
  background: var(--soft);
  font-weight: 500;
}
.diff-table td.before {
  color: var(--muted);
}
.diff-table td.after {
  background: color-mix(in srgb, var(--focus) 8%, transparent);
}
.lines {
  font-family: var(--font-mono);
}
.line.removed {
  color: var(--danger);
  text-decoration: line-through;
}
.line.added {
  color: var(--t-skill);
}
.actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.hint {
  font-size: 12px;
  color: var(--muted);
}
.empty {
  color: var(--muted);
  padding: 20px 8px;
}
@media (max-width: 860px) {
  .drawer {
    width: 100%;
  }
  .body-grid {
    grid-template-columns: 1fr;
  }
}
</style>
