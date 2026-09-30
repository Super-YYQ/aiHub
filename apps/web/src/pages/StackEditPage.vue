<script setup lang="ts">
// 环境新建与编辑（原型 renderStackEditor）。
import { computed, reactive } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useStacksStore, useEntriesStore } from '../stores/data';
import { useUiStore } from '../stores/ui';
import { api } from '../lib/api';

const route = useRoute();
const router = useRouter();
const stacks = useStacksStore();
const entries = useEntriesStore();
const ui = useUiStore();

const isEdit = computed(() => route.name === 'stack-edit');
const editing = computed(() =>
  isEdit.value ? stacks.stacks.find((s) => s.id === String(route.params.id)) : undefined,
);

const STACK_KINDS = [
  { id: 'pc', name: '电脑' },
  { id: 'server', name: '服务器' },
  { id: 'phone', name: '手机' },
  { id: 'tablet', name: '平板' },
  { id: 'scene', name: '使用场景' },
];
const STACK_OS = [
  { id: 'windows', name: 'Windows' },
  { id: 'macos', name: 'macOS' },
  { id: 'linux', name: 'Linux' },
  { id: 'ios', name: 'iOS' },
  { id: 'android', name: 'Android' },
  { id: 'any', name: '不限系统' },
];

const form = reactive({
  name: editing.value?.name ?? '',
  kind: editing.value?.kind ?? 'pc',
  os: editing.value?.os ?? 'windows',
  description: editing.value?.description ?? '',
});

const memberCount = computed(() =>
  editing.value
    ? entries.entries.filter((e) => e.stacks.some((r) => r.id === editing.value!.id)).length
    : 0,
);

async function save() {
  if (!form.name.trim()) {
    ui.showToast('请填写环境名称');
    return;
  }
  const body = {
    name: form.name.trim(),
    kind: form.kind,
    os: form.os,
    description: form.description.trim(),
    sort: editing.value?.sort ?? stacks.stacks.length,
  };
  try {
    if (isEdit.value && editing.value) {
      await fetch(`/api/stacks/${editing.value.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'If-Match': `"${editing.value.version}"` },
        body: JSON.stringify(body),
      });
      ui.showToast('已保存环境');
      router.push(`/stacks/${editing.value.id}`);
    } else {
      const created = await api.post<{ id: string }>('/stacks', body);
      ui.showToast('已新建环境');
      router.push(`/stacks/${created.data.id}`);
    }
    const { syncSoon } = await import('../lib/sync');
    await syncSoon();
    await stacks.refresh();
  } catch (err) {
    const e = err as { message?: string };
    ui.showToast(e.message ?? '保存失败');
  }
}

async function remove() {
  if (!editing.value) return;
  if (!confirm(`删除环境“${editing.value.name}”？条目本身不会被删除。`)) return;
  await fetch(`/api/stacks/${editing.value.id}`, {
    method: 'DELETE',
    headers: { 'If-Match': `"${editing.value.version}"` },
  });
  ui.showToast('已删除环境');
  router.push('/stacks');
  const { syncSoon } = await import('../lib/sync');
  await syncSoon();
  await stacks.refresh();
}
</script>

<template>
  <div class="page">
    <form class="form" autocomplete="off" @submit.prevent="save">
      <label class="field">
        <span>名称</span>
        <input
          v-model="form.name"
          required
          placeholder="如：公司 MacBook、写作场景"
          data-testid="stack-name"
        />
      </label>
      <div class="form-row">
        <label class="field">
          <span>类型</span>
          <select v-model="form.kind">
            <option v-for="k in STACK_KINDS" :key="k.id" :value="k.id">{{ k.name }}</option>
          </select>
        </label>
        <label class="field">
          <span>系统</span>
          <select v-model="form.os">
            <option v-for="o in STACK_OS" :key="o.id" :value="o.id">{{ o.name }}</option>
          </select>
        </label>
      </div>
      <label class="field">
        <span>说明</span>
        <input v-model="form.description" placeholder="用途、硬件或注意事项" />
      </label>
      <div class="form-actions">
        <button class="btn btn-primary" type="submit" data-testid="stack-save">
          {{ isEdit ? '保存' : '新建' }}
        </button>
        <router-link class="btn" :to="isEdit && editing ? `/stacks/${editing.id}` : '/stacks'">
          取消
        </router-link>
        <button
          v-if="isEdit"
          class="btn btn-danger"
          type="button"
          data-testid="stack-delete"
          @click="remove"
        >
          删除环境
        </button>
      </div>
      <p v-if="isEdit" class="hint">
        删除环境不会删除条目，只会解除它和 {{ memberCount }} 个条目的关联。
      </p>
    </form>
  </div>
</template>

<style scoped>
.form {
  display: grid;
  gap: 16px;
  max-width: 560px;
}
.form-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
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
  width: 100%;
  padding: 7px 10px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
}
.form-actions {
  display: flex;
  gap: 8px;
  padding-top: 8px;
}
.form-actions .btn-danger {
  margin-left: auto;
}
.hint {
  font-size: 12px;
  color: var(--muted);
}
@media (max-width: 860px) {
  .field input,
  .field select {
    font-size: 16px;
  }
}
</style>
