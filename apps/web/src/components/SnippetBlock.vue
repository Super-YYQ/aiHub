<script setup lang="ts">
// 片段块（原型 snippet）：复制按钮、变量输入、安装命令标记。
import { computed, ref } from 'vue';
import { parseVariables, applyVariables } from '@aikit/shared';
import type { StoredSnippet } from '@aikit/shared';
import { useUiStore } from '../stores/ui';

const props = defineProps<{ snippet: StoredSnippet }>();
const ui = useUiStore();

const vars = computed(() => parseVariables(props.snippet.code));
const values = ref<Record<string, string>>({});

const escapedCode = computed(() =>
  props.snippet.code
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/\{\{([^{}]+)\}\}/g, '<span class="var">{{$1}}</span>'),
);

async function copy() {
  const code = applyVariables(props.snippet.code, values.value);
  try {
    await navigator.clipboard.writeText(code);
    ui.showToast(`已复制：${props.snippet.label || '片段'}`);
  } catch {
    ui.showToast('复制失败，请手动选择复制');
  }
}
</script>

<template>
  <div class="snippet">
    <div class="snippet-head">
      <strong>{{ snippet.label || '片段' }}</strong>
      <span class="lang">{{ snippet.lang || 'text' }}</span>
      <span v-if="snippet.install" class="chip">安装命令</span>
      <button class="btn btn-sm" type="button" @click="copy">
        {{ vars.length ? '填好后复制' : '复制' }}
      </button>
    </div>
    <pre
      :class="{ wrap: /^(text|markdown|md)$/.test(snippet.lang || 'text') }"
    ><code v-html="escapedCode"></code></pre>
    <div v-if="vars.length" class="vars">
      <label v-for="v in vars" :key="v">
        {{ v }}
        <textarea v-model="values[v]" rows="1" :data-var="v"></textarea>
      </label>
    </div>
  </div>
</template>

<style scoped>
.snippet {
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  overflow: hidden;
  margin-bottom: 12px;
}
.snippet-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: var(--soft);
  font-size: 12px;
}
.snippet-head .lang {
  color: var(--muted);
  font-family: var(--font-mono);
}
.snippet-head .btn {
  margin-left: auto;
}
.snippet pre {
  margin: 0;
  padding: 12px 14px;
  overflow-x: auto;
  background: var(--bg);
  line-height: 1.55;
  white-space: pre;
}
.snippet pre.wrap {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.snippet :deep(.var) {
  color: var(--t-prompt);
  font-weight: 600;
}
.vars {
  display: grid;
  gap: 8px;
  padding: 12px 14px;
  border-top: 1px solid var(--line);
}
.vars label {
  display: grid;
  gap: 4px;
  font-size: 12px;
  color: var(--muted);
}
.vars textarea {
  min-height: 38px;
  padding: 7px 10px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
}
</style>
