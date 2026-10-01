<script setup lang="ts">
// 外观面板（08-ui-spec#切换与保存）：结构、配色、深浅色三组选项。
import { useUiStore, type LayoutId, type StyleId, type ThemePref } from '../stores/ui';

const emit = defineEmits<{ close: [] }>();
const ui = useUiStore();

const LAYOUTS: Array<{ id: LayoutId; name: string; note: string }> = [
  { id: 'panes', name: '1 三栏', note: '侧栏 + 列表 + 详情，切换条目最快' },
  { id: 'gallery', name: '2 卡片墙', note: '卡片网格，卡片上直接复制，详情从右侧滑出' },
  { id: 'launcher', name: '3 搜索优先', note: '中间一个大搜索框，左边结果右边预览，回车复制' },
  { id: 'board', name: '4 看板', note: '按状态分列，拖动卡片改状态；也能按环境或类型分列' },
  { id: 'docs', name: '5 知识库', note: '左侧目录树，中间文档页，右侧属性栏' },
];
const STYLES: Array<{ id: StyleId; name: string; note: string }> = [
  { id: 'soft', name: 'A 柔和', note: '浮起的卡片、柔和阴影、大圆角' },
  { id: 'calm', name: 'B 沉静', note: '信息密度高，细线分隔' },
  { id: 'glass', name: 'C 夜航', note: '半透明磨砂面板，深色模式更出彩' },
];
const THEMES: Array<{ id: ThemePref; name: string }> = [
  { id: 'system', name: '跟随系统' },
  { id: 'light', name: '浅色' },
  { id: 'dark', name: '深色' },
];

function onKey(ev: KeyboardEvent) {
  if (ev.key === 'Escape') emit('close');
}
</script>

<template>
  <Teleport to="body">
    <div class="backdrop" @click.self="emit('close')" @keydown="onKey">
      <div class="panel" role="dialog" aria-modal="true" aria-label="外观">
        <h2>界面结构</h2>
        <div class="cards">
          <button
            v-for="l in LAYOUTS"
            :key="l.id"
            type="button"
            :aria-pressed="ui.layout === l.id"
            @click="ui.setLayout(l.id)"
          >
            <strong>{{ l.name }}</strong><small>{{ l.note }}</small>
          </button>
        </div>
        <h2>配色方案</h2>
        <div class="cards">
          <button
            v-for="s in STYLES"
            :key="s.id"
            type="button"
            :aria-pressed="ui.style === s.id"
            @click="ui.setStyle(s.id)"
          >
            <strong>{{ s.name }}</strong><small>{{ s.note }}</small>
          </button>
        </div>
        <h2>深浅色</h2>
        <div class="cards">
          <button
            v-for="t in THEMES"
            :key="t.id"
            type="button"
            :aria-pressed="ui.themePref === t.id"
            @click="ui.setThemePref(t.id)"
          >
            <strong>{{ t.name }}</strong>
          </button>
        </div>
        <div class="foot">
          <button class="btn" type="button" @click="emit('close')">关闭</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 44;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 10vh 16px 16px;
  background: color-mix(in srgb, var(--ink) 28%, transparent);
}
.panel {
  width: min(640px, 100%);
  max-height: 80vh;
  overflow-y: auto;
  padding: 20px 24px;
  border-radius: var(--r-lg);
  background: var(--surface);
  box-shadow: var(--shadow-pop, 0 24px 60px -20px color-mix(in srgb, var(--ink) 45%, transparent));
}
.panel h2 {
  margin: 16px 0 8px;
  font-size: 15px;
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}
.cards button {
  display: grid;
  gap: 4px;
  padding: 12px 14px;
  text-align: left;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
  cursor: pointer;
}
.cards button[aria-pressed='true'] {
  border-color: var(--ink);
  box-shadow: inset 0 0 0 1px var(--ink);
}
.cards small {
  color: var(--muted);
}
.foot {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
