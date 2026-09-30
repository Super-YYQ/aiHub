<script setup lang="ts">
// 待确认页（04-frontend#页面规格）：按 AI 代理与时间分组；
// 操作：接受、修改后接受（载入编辑页）、拒绝；多选批量；过期提案标出。
import { computed, ref, onMounted } from 'vue';
import type { Proposal } from '@aikit/shared';
import { useProposalsStore, useEntriesStore } from '../stores/data';
import { useUiStore } from '../stores/ui';
import { syncSoon } from '../lib/sync';
import { relDate } from '../lib/display';

const proposals = useProposalsStore();
const entries = useEntriesStore();
const ui = useUiStore();

const checked = ref<Set<string>>(new Set());
const busy = ref(false);

onMounted(async () => {
  // 进入页面先拉一次：接受/拒绝发生在别的页面时也要立即反映
  await syncSoon();
  await proposals.load();
});

const KIND_NAMES: Record<string, string> = {
  create: '新建',
  update: '修改',
  archive: '弃用',
  merge: '合并',
};

interface Draft {
  type: string;
  title: string;
  summary?: string;
  slug?: string;
  status?: string;
  tags?: string[];
  fields?: Record<string, string>;
  snippets?: Array<{ label?: string; lang?: string; code: string; install?: boolean }>;
  links?: Array<{ label?: string; url: string }>;
  body?: string;
}

const draftOf = (p: Proposal): Draft | null => {
  const payload = p.payload as { draft?: Draft; mergeIds?: string[] } | null;
  return payload?.draft ?? null;
};

const groups = computed(() => {
  const map = new Map<string, Proposal[]>();
  for (const p of proposals.pending) {
    const key = p.actor;
    const list = map.get(key) ?? [];
    list.push(p);
    map.set(key, list);
  }
  return [...map.entries()].map(([actor, list]) => ({
    actor,
    list: [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  }));
});

const targetTitle = (p: Proposal) => {
  if (!p.targetEntryId) return '';
  return entries.byId(p.targetEntryId)?.title ?? p.targetEntryId;
};

const isChecked = (id: string) => checked.value.has(id);
function toggle(id: string) {
  const next = new Set(checked.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  checked.value = next;
}
const checkedList = computed(() => [...checked.value]);

async function refresh() {
  await syncSoon();
  await proposals.load();
  await entries.refresh();
}

async function accept(p: Proposal) {
  busy.value = true;
  try {
    const res = await fetch(`/api/proposals/${p.id}/accept`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      ui.showToast(body?.error?.message ?? '接受失败');
    } else {
      ui.showToast('已接受提案');
      checked.value.delete(p.id);
      await refresh();
    }
  } finally {
    busy.value = false;
  }
}

async function reject(p: Proposal) {
  busy.value = true;
  try {
    const res = await fetch(`/api/proposals/${p.id}/reject`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: '' }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      ui.showToast(body?.error?.message ?? '拒绝失败');
    } else {
      ui.showToast('已拒绝提案');
      checked.value.delete(p.id);
      await refresh();
    }
  } finally {
    busy.value = false;
  }
}

/** 修改后接受：把草稿带进编辑页（04-frontend）。 */
async function editThenAccept(p: Proposal) {
  const draft = draftOf(p);
  if (draft) {
    // 通过 sessionStorage 把草稿与提案 ID 传给编辑页
    sessionStorage.setItem(
      'aikit.proposalDraft',
      JSON.stringify({ proposalId: p.id, targetEntryId: p.targetEntryId, draft }),
    );
  }
  location.href = p.targetEntryId
    ? `/edit/${p.targetEntryId}?proposal=${p.id}`
    : `/new?proposal=${p.id}`;
}

async function bulk(action: 'accept' | 'reject') {
  if (!checkedList.value.length) {
    ui.showToast('先勾选要处理的提案');
    return;
  }
  busy.value = true;
  try {
    const res = await fetch('/api/proposals/bulk', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids: checkedList.value, action }),
    });
    const body = (await res.json()) as {
      results: Array<{ id: string; ok: boolean; error?: { message: string } }>;
    };
    const okCount = body.results.filter((r) => r.ok).length;
    const failed = body.results.filter((r) => !r.ok);
    ui.showToast(action === 'accept' ? `已接受 ${okCount} 条提案` : `已拒绝 ${okCount} 条提案`);
    if (failed.length) {
      ui.showToast(`有 ${failed.length} 条失败：${failed[0].error?.message ?? ''}`);
    }
    checked.value = new Set();
    await refresh();
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="page">
    <div class="head">
      <h1>
        待确认 <span class="count">{{ proposals.pending.length }}</span>
      </h1>
      <div v-if="proposals.pending.length" class="bulk-actions">
        <button
          class="btn"
          type="button"
          :disabled="busy || !checkedList.length"
          data-testid="bulk-accept"
          @click="bulk('accept')"
        >
          批量接受（{{ checkedList.length }}）
        </button>
        <button
          class="btn"
          type="button"
          :disabled="busy || !checkedList.length"
          @click="bulk('reject')"
        >
          批量拒绝
        </button>
      </div>
    </div>

    <p v-if="!proposals.pending.length" class="lede">
      现在没有等待确认的提案。让 AI 代理按数据收集规则说明整理档案，它的建议会出现在这里。
    </p>

    <section v-for="g in groups" :key="g.actor" class="group">
      <h2>
        {{ g.actor }} <span class="count">{{ g.list.length }}</span>
      </h2>
      <article v-for="p in g.list" :key="p.id" class="card" data-testid="proposal-card">
        <label class="check">
          <input
            type="checkbox"
            :checked="isChecked(p.id)"
            :data-testid="`proposal-check-${p.id}`"
            @change="toggle(p.id)"
          />
        </label>
        <div class="card-main">
          <div class="card-top">
            <span class="chip">{{ KIND_NAMES[p.kind] ?? p.kind }}</span>
            <span v-if="targetTitle(p)" class="target mono">{{ targetTitle(p) }}</span>
            <span class="time">{{ relDate(p.createdAt) }}</span>
          </div>
          <div v-if="draftOf(p)" class="draft" data-testid="proposal-draft">
            <strong>{{ draftOf(p)!.title }}</strong>
            <p v-if="draftOf(p)!.summary">{{ draftOf(p)!.summary }}</p>
            <pre
              v-if="draftOf(p)!.snippets?.length"
              class="mono"
            ><code>{{ draftOf(p)!.snippets![0].code }}</code></pre>
          </div>
          <p class="reason">理由：{{ p.reason || '（没有写理由）' }}</p>
        </div>
        <div class="card-actions">
          <button
            class="btn btn-sm btn-primary"
            type="button"
            :disabled="busy"
            :data-testid="`proposal-accept-${p.id}`"
            @click="accept(p)"
          >
            接受
          </button>
          <button class="btn btn-sm" type="button" :disabled="busy" @click="editThenAccept(p)">
            修改后接受
          </button>
          <button
            class="btn btn-sm"
            type="button"
            :disabled="busy"
            :data-testid="`proposal-reject-${p.id}`"
            @click="reject(p)"
          >
            拒绝
          </button>
        </div>
      </article>
    </section>
  </div>
</template>

<style scoped>
h1 {
  font-size: 22px;
  margin: 0;
}
h2 {
  font-size: 15px;
  margin: 24px 0 12px;
}
.count {
  font-size: 12px;
  font-weight: 400;
  color: var(--muted);
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
}
.bulk-actions {
  display: flex;
  gap: 8px;
}
.group .card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 14px;
  padding: 14px 16px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
  margin-bottom: 10px;
}
.check input {
  margin: 0;
}
.card-top {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.card-top .time {
  margin-left: auto;
  font-size: 12px;
  color: var(--muted);
}
.target {
  font-size: 13px;
  color: var(--ink);
}
.draft strong {
  display: block;
  margin: 8px 0 4px;
}
.draft p {
  margin: 0 0 6px;
  color: var(--muted);
  font-size: 13px;
}
.draft pre {
  margin: 0;
  padding: 8px 10px;
  border-radius: var(--r-sm);
  background: var(--bg);
  overflow-x: auto;
  font-size: 12px;
}
.reason {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--muted);
}
.card-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: stretch;
}
.lede {
  color: var(--muted);
  margin-top: 16px;
}
@media (max-width: 860px) {
  .group .card {
    grid-template-columns: auto minmax(0, 1fr);
  }
  .card-actions {
    grid-column: 2;
    flex-direction: row;
    flex-wrap: wrap;
  }
}
</style>
