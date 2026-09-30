import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { useUiStore } from './stores/ui';
import { startAutoSync, crossTabSync } from './lib/sync';
import {
  useEntriesStore,
  useStacksStore,
  useDictionariesStore,
  useProposalsStore,
} from './stores/data';
import './styles/base.css';

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);
app.use(router);

// 启动流程（04-frontend#状态与离线同步）：
// 1. 先从 IndexedDB 读出数据立即渲染 2. 后台拉增量 3. 外观已在 index.html 内联脚本里定好
const ui = useUiStore();
ui.applyAppearance();
ui.watchSync();

const entries = useEntriesStore();
const stacks = useStacksStore();
const dicts = useDictionariesStore();
const proposals = useProposalsStore();
void entries.load();
void stacks.load();
void dicts.load();
void proposals.load();

const stopAutoSync = startAutoSync();
const stopCrossTab = crossTabSync(() => {
  void entries.refresh();
  void stacks.refresh();
  void proposals.load();
});

app.mount('#app');

// 清理钩子只在测试环境用得到；正常 SPA 不卸载
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    stopAutoSync();
    stopCrossTab();
  });
}
