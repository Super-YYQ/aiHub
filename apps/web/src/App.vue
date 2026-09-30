<script setup lang="ts">
// 应用外壳：侧栏 + 顶部栏 + 视图 + 底部导航（手机）。
import { onMounted, onBeforeUnmount } from 'vue';
import AppRail from './components/AppRail.vue';
import TopBar from './components/TopBar.vue';
import TabBar from './components/TabBar.vue';
import CommandPalette from './components/CommandPalette.vue';
import CaptureSheet from './components/CaptureSheet.vue';
import AppearancePanel from './components/AppearancePanel.vue';
import Toast from './components/Toast.vue';
import { useUiStore } from './stores/ui';
import { shortcuts } from './lib/shortcuts';

const ui = useUiStore();

let stopShortcuts: (() => void) | null = null;
onMounted(() => {
  stopShortcuts = shortcuts({
    openSearch: () => (ui.paletteOpen = true),
    openCapture: () => (ui.captureOpen = true),
  });
});
onBeforeUnmount(() => stopShortcuts?.());
</script>

<template>
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
    <Toast v-if="ui.toast" :text="ui.toast.text" />
  </div>
</template>
