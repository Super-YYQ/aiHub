<script setup lang="ts">
// 应用外壳：侧栏 + 顶部栏 + 视图 + 底部导航（手机）+ 覆盖层。
import { onMounted, onBeforeUnmount, watch } from 'vue';
import AppRail from './components/AppRail.vue';
import TopBar from './components/TopBar.vue';
import TabBar from './components/TabBar.vue';
import CommandPalette from './components/CommandPalette.vue';
import CaptureSheet from './components/CaptureSheet.vue';
import AppearancePanel from './components/AppearancePanel.vue';
import ConflictDialog from './components/ConflictDialog.vue';
import Toast from './components/Toast.vue';
import { useUiStore } from './stores/ui';
import { getConflict } from './lib/sync';
import { shortcuts } from './lib/shortcuts';

const ui = useUiStore();

let stopShortcuts: (() => void) | null = null;
onMounted(() => {
  stopShortcuts = shortcuts({
    openSearch: () => (ui.paletteOpen = true),
    openCapture: () => (ui.captureOpen = true),
  });
  ui.watchUpdate(); // PWA 新版本提示
});
onBeforeUnmount(() => stopShortcuts?.());

// 同步冲突时自动弹出冲突对话框（04-frontend#冲突处理）
watch(
  () => ui.syncStatus,
  (status) => {
    if (status === 'conflict' && getConflict()) ui.conflictOpen = true;
  },
);
</script>

<template>
  <div class="glass-backdrop" aria-hidden="true"></div>
  <div class="app">
    <AppRail />
    <div class="main">
      <TopBar @open-search="ui.paletteOpen = true" @open-appearance="ui.appearanceOpen = true" />
      <div class="view">
        <router-view />
      </div>
    </div>
    <TabBar @capture="ui.captureOpen = true" @search="ui.paletteOpen = true" />
    <CommandPalette v-if="ui.paletteOpen" @close="ui.paletteOpen = false" />
    <CaptureSheet v-if="ui.captureOpen" @close="ui.captureOpen = false" />
    <AppearancePanel v-if="ui.appearanceOpen" @close="ui.appearanceOpen = false" />
    <ConflictDialog v-if="ui.conflictOpen" @close="ui.conflictOpen = false" />
    <Toast v-if="ui.toast" :text="ui.toast.text" />
    <div v-if="ui.updateReady" class="update-banner" role="status" data-testid="update-banner">
      <span>有新版本，刷新后生效。</span>
      <button class="btn btn-sm" type="button" data-testid="update-apply" @click="ui.applyUpdate()">
        刷新
      </button>
      <button
        class="btn btn-sm"
        type="button"
        aria-label="稍后再说"
        @click="ui.updateReady = false"
      >
        稍后
      </button>
    </div>
  </div>
</template>

<style scoped>
.update-banner {
  position: fixed;
  left: 50%;
  bottom: 76px;
  z-index: 55;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  border-radius: 999px;
  background: var(--ink);
  color: var(--bg);
  font-size: 13px;
  box-shadow: 0 10px 30px -12px color-mix(in srgb, var(--ink) 50%, transparent);
}
.update-banner .btn {
  background: transparent;
  border-color: color-mix(in srgb, var(--bg) 40%, transparent);
  color: var(--bg);
}
@media (min-width: 861px) {
  .update-banner {
    bottom: 28px;
  }
}
</style>
