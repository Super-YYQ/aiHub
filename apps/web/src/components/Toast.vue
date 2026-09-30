<script setup lang="ts">
// 提示条（原型 toast）。
defineProps<{ text: string }>();
</script>

<template>
  <div class="toast" role="status">{{ text }}</div>
</template>

<style scoped>
.toast {
  position: fixed;
  left: 50%;
  bottom: 28px;
  z-index: 50;
  transform: translateX(-50%);
  padding: 8px 16px;
  border-radius: 999px;
  background: var(--ink);
  color: var(--bg);
  font-size: 13px;
  animation: toast-in 160ms ease-out;
}
@keyframes toast-in {
  from {
    opacity: 0;
    transform: translate(-50%, 6px);
  }
}
@media (max-width: 860px) {
  .toast {
    bottom: 84px;
  }
}
</style>
