<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { SHARED_VERSION } from '@aikit/shared';

const health = ref<string>('检查中…');

onMounted(async () => {
  try {
    const res = await fetch('/api/health');
    const data = (await res.json()) as { ok?: boolean; db?: boolean };
    health.value = data.ok ? `接口正常（db: ${data.db ? '可用' : '不可用'}）` : '接口异常';
  } catch {
    health.value = '无法连接接口（本地开发请先启动 wrangler dev）';
  }
});
</script>

<template>
  <main class="placeholder">
    <h1>AI 工作台</h1>
    <p>工程骨架已就绪（占位页，WP7 起实现完整界面）。</p>
    <p class="health">/api/health：{{ health }}</p>
    <p class="ver">shared v{{ SHARED_VERSION }}</p>
  </main>
</template>

<style scoped>
.placeholder {
  max-width: 640px;
  margin: 12vh auto;
  padding: 0 24px;
  font-family: system-ui, sans-serif;
  color: #17212b;
}
h1 {
  font-size: 28px;
  margin-bottom: 8px;
}
.health {
  font-family: ui-monospace, Consolas, monospace;
  color: #2f6db5;
}
.ver {
  color: #5a6672;
  font-size: 13px;
}
</style>
