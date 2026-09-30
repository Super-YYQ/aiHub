<script setup lang="ts">
// 标签管理：列表（按使用次数）、改名合并。
import { computed, ref } from 'vue';
import { useEntriesStore } from '../stores/data';
import { useUiStore } from '../stores/ui';
import { syncSoon } from '../lib/sync';

const entries = useEntriesStore();
const ui = useUiStore();

const tags = computed(() => {
  const counts = new Map<string, number>();
  for (const e of entries.entries) {
    for (const t of e.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh'));
});

const renaming = ref<{ from: string; to: string } | null>(null);

function startRename(from: string) {
  renaming.value = { from, to: from };
}

async function applyRename() {
  if (!renaming.value) return;
  const { from, to } = renaming.value;
  if (!to.trim()) {
    ui.showToast('新名称不能为空');
    return;
  }
  try {
    const res = await fetch('/api/tags/rename', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: to.trim() }),
    });
    const result = (await res.json()) as { renamed?: number; error?: { message?: string } };
    if (!res.ok) throw new Error(result.error?.message ?? String(res.status));
    ui.showToast(`已把“${from}”改名/合并到“${to.trim()}”（${result.renamed} 个条目）`);
    renaming.value = null;
    await syncSoon();
    await entries.refresh();
  } catch (err) {
    ui.showToast((err as Error).message ?? '改名失败');
  }
}
</script>

<template>
  <div class="page">
    <h1>标签管理</h1>
    <p class="lede">
      标签来自条目。改名后所有相关条目都会更新并各有一条修订；目标已存在时相当于合并。
    </p>

    <section>
      <h2>全部标签</h2>
      <div v-if="tags.length" class="tag-list">
        <div v-for="[tag, count] in tags" :key="tag" class="tag-row">
          <template v-if="renaming?.from === tag">
            <input v-model="renaming.to" aria-label="新名称" data-testid="tag-rename-input" />
            <button
              class="btn btn-sm btn-primary"
              type="button"
              data-testid="tag-rename-confirm"
              @click="applyRename"
            >
              改名/合并
            </button>
            <button class="btn btn-sm" type="button" @click="renaming = null">取消</button>
          </template>
          <template v-else>
            <span class="chip">#{{ tag }}</span>
            <span class="count">{{ count }} 个条目</span>
            <button
              class="btn btn-sm"
              type="button"
              data-testid="tag-rename-start"
              @click="startRename(tag)"
            >
              改名/合并
            </button>
          </template>
        </div>
      </div>
      <p v-else class="lede">还没有任何标签。在编辑条目时可以添加。</p>
    </section>
  </div>
</template>

<style scoped>
h1 {
  font-size: 22px;
  margin: 0 0 8px;
}
h2 {
  font-size: 16px;
  margin: 24px 0 10px;
}
.lede {
  color: var(--muted);
  max-width: 62ch;
}
.tag-list {
  display: grid;
  gap: 8px;
  max-width: 560px;
}
.tag-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
}
.tag-row .count {
  margin-left: auto;
  font-size: 12px;
  color: var(--muted);
}
.tag-row input {
  padding: 5px 8px;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: var(--surface);
}
</style>
