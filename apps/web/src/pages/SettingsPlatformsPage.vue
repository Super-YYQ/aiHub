<script setup lang="ts">
// 平台管理：新建、改名、排序、删除（内置保护、in_use 提示）。
import { reactive, ref } from 'vue';
import { useDictionariesStore, useEntriesStore } from '../stores/data';
import { useUiStore } from '../stores/ui';
import { api } from '../lib/api';
import { sync } from '../lib/sync';

const dicts = useDictionariesStore();
const entries = useEntriesStore();
const ui = useUiStore();

const creating = reactive({ id: '', name: '', sort: 9 });
const error = ref<string | null>(null);

const platformCount = (id: string) =>
  entries.entries.filter((e) => e.platforms.includes(id)).length;

async function create() {
  error.value = null;
  if (!/^[a-z][a-z0-9-]{1,23}$/.test(creating.id)) {
    error.value = '平台 ID 需以小写字母开头，2–24 位小写字母、数字和连字符';
    return;
  }
  try {
    await api.post('/platforms', {
      id: creating.id,
      name: creating.name,
      sort: Number(creating.sort) || 0,
    });
    ui.showToast(`已新建平台“${creating.name}”`);
    creating.id = '';
    creating.name = '';
    await sync();
    await dicts.load();
  } catch (err) {
    error.value = (err as { message?: string }).message ?? '新建失败';
  }
}

async function savePlatform(id: string, patch: { name: string; sort: number }) {
  try {
    await fetch(`/api/platforms/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    ui.showToast('已保存');
    await sync();
    await dicts.load();
  } catch (err) {
    ui.showToast((err as { message?: string }).message ?? '保存失败');
  }
}

async function removePlatform(id: string) {
  try {
    await fetch(`/api/platforms/${id}`, { method: 'DELETE' });
    ui.showToast('已删除平台');
    await sync();
    await dicts.load();
  } catch (err) {
    ui.showToast((err as { message?: string }).message ?? '删除失败');
  }
}
</script>

<template>
  <div class="page">
    <h1>平台管理</h1>

    <section>
      <h2>新建平台</h2>
      <form class="form-row" autocomplete="off" @submit.prevent="create">
        <label class="field">
          <span>ID</span>
          <input v-model="creating.id" placeholder="如 windsurf" required />
        </label>
        <label class="field">
          <span>名称</span>
          <input v-model="creating.name" placeholder="如 Windsurf" required />
        </label>
        <label class="field">
          <span>排序</span>
          <input v-model="creating.sort" type="number" min="0" />
        </label>
        <button class="btn btn-primary" type="submit">新建</button>
      </form>
      <p v-if="error" class="error">{{ error }}</p>
    </section>

    <section>
      <h2>已有平台</h2>
      <div v-for="p in dicts.platforms" :key="p.id" class="row-editor">
        <input
          :value="p.name"
          aria-label="名称"
          @change="
            (ev) =>
              savePlatform(p.id, { name: (ev.target as HTMLInputElement).value, sort: p.sort })
          "
        />
        <input
          :value="p.sort"
          type="number"
          min="0"
          aria-label="排序"
          style="width: 64px"
          @change="
            (ev) =>
              savePlatform(p.id, {
                name: p.name,
                sort: Number((ev.target as HTMLInputElement).value) || 0,
              })
          "
        />
        <span class="count">{{ platformCount(p.id) }} 个条目</span>
        <button
          class="btn btn-sm btn-danger"
          type="button"
          :disabled="p.builtin"
          @click="removePlatform(p.id)"
        >
          {{ p.builtin ? '内置' : '删除' }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
h1 {
  font-size: 22px;
  margin: 0 0 20px;
}
h2 {
  font-size: 16px;
  margin: 0 0 10px;
}
section {
  margin-top: 28px;
}
.form-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: end;
}
.field {
  display: grid;
  gap: 4px;
}
.field > span {
  font-size: 12px;
  color: var(--muted);
}
.field input {
  padding: 7px 10px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
}
.error {
  margin-top: 8px;
  color: var(--danger);
  font-size: 13px;
}
.row-editor {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 10px;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
}
.row-editor input {
  padding: 5px 8px;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: var(--surface);
}
.row-editor .count {
  margin-left: auto;
  font-size: 12px;
  color: var(--muted);
}
</style>
