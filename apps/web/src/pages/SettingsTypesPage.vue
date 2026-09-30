<script setup lang="ts">
// 类型管理（02#字典与环境、WP12）：新建（ID/颜色/字段模板）、改、删（内置保护、in_use）。
import { reactive, ref } from 'vue';
import { useDictionariesStore, useEntriesStore } from '../stores/data';
import { useUiStore } from '../stores/ui';
import { api } from '../lib/api';
import { sync } from '../lib/sync';

const dicts = useDictionariesStore();
const entries = useEntriesStore();
const ui = useUiStore();

const PRESET_COLORS = [
  '#2f6db5',
  '#8349bd',
  '#237f50',
  '#c43d32',
  '#a36700',
  '#0b7a87',
  '#56626f',
  '#ad3571',
  '#556b2f',
  '#6b552f',
  '#7d3f6b',
  '#4a5d6b',
];

const creating = reactive({
  id: '',
  name: '',
  color: PRESET_COLORS[8],
  fieldTemplate: '',
  sort: 9,
});
const error = ref<string | null>(null);

const typeCount = (id: string) => entries.entries.filter((e) => e.type === id).length;

async function create() {
  error.value = null;
  if (!/^[a-z][a-z0-9-]{1,23}$/.test(creating.id)) {
    error.value = '类型 ID 需以小写字母开头，2–24 位小写字母、数字和连字符';
    return;
  }
  try {
    await api.post('/types', {
      id: creating.id,
      name: creating.name,
      color: creating.color,
      fieldTemplate: creating.fieldTemplate
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean),
      sort: Number(creating.sort) || 0,
    });
    ui.showToast(`已新建类型“${creating.name}”`);
    creating.id = '';
    creating.name = '';
    creating.fieldTemplate = '';
    await sync();
    await dicts.load();
  } catch (err) {
    error.value = (err as { message?: string }).message ?? '新建失败';
  }
}

async function saveType(
  id: string,
  patch: { name: string; color: string; fieldTemplate: string[]; sort: number },
) {
  try {
    await fetch(`/api/types/${id}`, {
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

async function removeType(id: string) {
  try {
    await fetch(`/api/types/${id}`, { method: 'DELETE' });
    ui.showToast('已删除类型');
    await sync();
    await dicts.load();
  } catch (err) {
    ui.showToast((err as { message?: string }).message ?? '删除失败');
  }
}
</script>

<template>
  <div class="page">
    <h1>类型管理</h1>

    <section>
      <h2>新建类型</h2>
      <form class="form-row" autocomplete="off" @submit.prevent="create">
        <label class="field">
          <span>ID</span>
          <input
            v-model="creating.id"
            placeholder="如 workflow"
            required
            data-testid="new-type-id"
          />
        </label>
        <label class="field">
          <span>名称</span>
          <input
            v-model="creating.name"
            placeholder="如 工作流"
            required
            data-testid="new-type-name"
          />
        </label>
        <label class="field">
          <span>颜色</span>
          <select v-model="creating.color">
            <option v-for="c in PRESET_COLORS" :key="c" :value="c">{{ c }}</option>
          </select>
        </label>
        <label class="field">
          <span>字段模板</span>
          <input v-model="creating.fieldTemplate" placeholder="用逗号分隔，如：触发, 依赖" />
        </label>
        <label class="field">
          <span>排序</span>
          <input v-model="creating.sort" type="number" min="0" />
        </label>
        <button class="btn btn-primary" type="submit" data-testid="new-type-submit">新建</button>
      </form>
      <p v-if="error" class="error">{{ error }}</p>
    </section>

    <section>
      <h2>已有类型</h2>
      <div v-for="t in dicts.types" :key="t.id" class="type-editor" :data-type="t.id">
        <span class="swatch" :data-type="t.id"></span>
        <input
          :value="t.name"
          aria-label="名称"
          :data-testid="`type-name-${t.id}`"
          @change="
            (ev) =>
              saveType(t.id, {
                name: (ev.target as HTMLInputElement).value,
                color: t.color,
                fieldTemplate: t.fieldTemplate,
                sort: t.sort,
              })
          "
        />
        <select
          :value="t.color"
          aria-label="颜色"
          @change="
            (ev) =>
              saveType(t.id, {
                name: t.name,
                color: (ev.target as HTMLSelectElement).value,
                fieldTemplate: t.fieldTemplate,
                sort: t.sort,
              })
          "
        >
          <option v-for="c in PRESET_COLORS" :key="c" :value="c">{{ c }}</option>
        </select>
        <input
          :value="t.fieldTemplate.join(', ')"
          aria-label="字段模板"
          placeholder="用逗号分隔"
          :data-testid="`type-template-${t.id}`"
          @change="
            (ev) =>
              saveType(t.id, {
                name: t.name,
                color: t.color,
                fieldTemplate: (ev.target as HTMLInputElement).value
                  .split(/[,，]/)
                  .map((s) => s.trim())
                  .filter(Boolean),
                sort: t.sort,
              })
          "
        />
        <input
          :value="t.sort"
          type="number"
          min="0"
          aria-label="排序"
          style="width: 64px"
          @change="
            (ev) =>
              saveType(t.id, {
                name: t.name,
                color: t.color,
                fieldTemplate: t.fieldTemplate,
                sort: Number((ev.target as HTMLInputElement).value) || 0,
              })
          "
        />
        <span class="count">{{ typeCount(t.id) }} 个条目</span>
        <button
          class="btn btn-sm btn-danger"
          type="button"
          :disabled="t.builtin"
          :data-testid="`type-delete-${t.id}`"
          @click="removeType(t.id)"
        >
          {{ t.builtin ? '内置' : '删除' }}
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
  max-width: 900px;
}
.field {
  display: grid;
  gap: 4px;
}
.field > span {
  font-size: 12px;
  color: var(--muted);
}
.field input,
.field select {
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
.type-editor {
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
.type-editor input,
.type-editor select {
  padding: 5px 8px;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: var(--surface);
}
.type-editor .count {
  margin-left: auto;
  font-size: 12px;
  color: var(--muted);
}
</style>
