<script setup lang="ts">
// 手机记录面板（底部弹出，原型 sheet）：类型单选 + 多行输入 + 存入待整理。
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { useEntriesStore, useDictionariesStore } from '../stores/data';
import { useUiStore } from '../stores/ui';
import { BUILTIN_TYPES } from '@aikit/shared';

const emit = defineEmits<{ close: [] }>();
const router = useRouter();
const entries = useEntriesStore();
const dicts = useDictionariesStore();
const ui = useUiStore();

const type = ref('tool');
const text = ref('');
const textarea = ref<HTMLTextAreaElement | null>(null);
const lastFocus = document.activeElement as HTMLElement | null;

onMounted(() => {
  // Android 分享进入（PWA share_target）：预填标题/文本/链接（04-frontend#PWA）
  if (ui.sharePrefill) {
    const { title, text: sharedText, url } = ui.sharePrefill;
    text.value = [title, sharedText, url].filter(Boolean).join('\n');
    ui.sharePrefill = null;
  }
  setTimeout(() => textarea.value?.focus(), 60);
  document.addEventListener('keydown', onKey);
});
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey);
  lastFocus?.focus?.();
});

function onKey(ev: KeyboardEvent) {
  if (ev.key === 'Escape') emit('close');
}

async function submit() {
  const t = text.value.trim();
  if (!t) return;
  await entries.capture(type.value, t);
  ui.showToast('已存入待整理');
  emit('close');
}

function writeFull() {
  const t = text.value.trim().split('\n')[0]?.slice(0, 60) ?? '';
  emit('close');
  void router.push({ path: `/new/${type.value}`, query: { title: t } });
}
</script>

<template>
  <Teleport to="body">
    <div class="sheet-backdrop" @click.self="emit('close')">
      <form
        class="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        @submit.prevent="submit"
      >
        <div class="grab" aria-hidden="true"></div>
        <h2 id="sheet-title">记一笔</h2>
        <fieldset class="type-picks">
          <legend class="sr-only">类型</legend>
          <label
            v-for="t in dicts.types.length ? dicts.types : BUILTIN_TYPES"
            :key="t.id"
            :data-type="t.id"
          >
            <input v-model="type" type="radio" name="sheet-type" :value="t.id" />
            <span>{{ t.name }}</span>
          </label>
        </fieldset>
        <label class="sr-only" for="sheet-text">内容</label>
        <textarea
          id="sheet-text"
          ref="textarea"
          v-model="text"
          placeholder="名字、链接或一段提示词。先存进待整理，有空再补全。"
          required
        ></textarea>
        <div class="sheet-actions">
          <button class="btn" type="button" @click="writeFull">写完整条目</button>
          <button class="btn btn-primary" type="submit">存入待整理</button>
        </div>
      </form>
    </div>
  </Teleport>
</template>

<style scoped>
.sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 45;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: color-mix(in srgb, var(--ink) 30%, transparent);
  animation: fade-in 0.18s ease-out;
}
@keyframes fade-in {
  from {
    opacity: 0;
  }
}
.sheet {
  display: grid;
  gap: 12px;
  width: min(560px, 100%);
  padding: 10px 16px calc(16px + env(safe-area-inset-bottom));
  border-radius: 24px 24px 0 0;
  background: var(--surface);
  box-shadow: 0 -12px 40px -16px color-mix(in srgb, var(--ink) 45%, transparent);
  animation: sheet-up 0.28s cubic-bezier(0.2, 0.8, 0.2, 1);
}
@keyframes sheet-up {
  from {
    transform: translateY(100%);
  }
}
.grab {
  justify-self: center;
  width: 40px;
  height: 5px;
  border-radius: 999px;
  background: var(--line);
}
.sheet h2 {
  margin: 0;
  font-size: 17px;
}
.sheet textarea {
  width: 100%;
  min-height: 96px;
  padding: 10px 12px;
  resize: none;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--bg);
  font-size: 16px;
  line-height: 1.5;
}
.sheet-actions {
  display: flex;
  gap: 8px;
}
.sheet-actions .btn {
  justify-content: center;
  padding: 10px 14px;
}
.sheet-actions .btn-primary {
  flex: 1;
}
.type-picks {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;
  padding: 0;
  border: 0;
}
.type-picks label {
  position: relative;
}
.type-picks input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}
.type-picks span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  background: var(--soft);
  font-size: 14px;
  cursor: pointer;
}
.type-picks span::before {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--tc);
}
.type-picks input:checked + span {
  background: color-mix(in srgb, var(--tc) 16%, var(--surface));
  box-shadow: inset 0 0 0 1.5px var(--tc);
}
.type-picks input:focus-visible + span {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
</style>
