import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { useUiStore } from './stores/ui';
import { startAutoSync, crossTabSync, onSyncState } from './lib/sync';
import {
  useEntriesStore,
  useStacksStore,
  useDictionariesStore,
  useProposalsStore,
} from './stores/data';
import './styles/base.css';
import './styles/tokens.css';

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
const reload = () => {
  void entries.refresh();
  void stacks.refresh();
  void dicts.load();
  void proposals.load();
};
void entries.load();
void stacks.load();
void dicts.load();
void proposals.load();

const stopAutoSync = startAutoSync();
// 本标签页同步完成后、其他标签页写入后：都从 Dexie 重新读取
const stopOnSync = onSyncState((status) => {
  if (status === 'idle') reload();
});
const stopCrossTab = crossTabSync(reload);

app.mount('#app');

// 清理钩子只在开发 HMR 用得到；正常 SPA 不卸载
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    stopAutoSync();
    stopOnSync();
    stopCrossTab();
  });
}
