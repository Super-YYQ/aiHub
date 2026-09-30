<script setup lang="ts">
// 工作台（04-frontend#页面规格）：快速记录、置顶、最近更新、在用构成、待整理、待确认、试用中与想试。
// 结构 5 知识库的工作台是文档式首页，由 DocsBrowse 的“首页”形态渲染。
import { computed, ref, defineAsyncComponent } from 'vue';
import { useEntriesStore, useDictionariesStore } from '../stores/data';
import { useUiStore } from '../stores/ui';
import EntryRow from '../components/EntryRow.vue';

const DocsBrowse = defineAsyncComponent(() => import('../components/browse/DocsBrowse.vue'));
const GalleryBrowse = defineAsyncComponent(() => import('../components/browse/GalleryBrowse.vue'));
const LauncherBrowse = defineAsyncComponent(
  () => import('../components/browse/LauncherBrowse.vue'),
);
const BoardBrowse = defineAsyncComponent(() => import('../components/browse/BoardBrowse.vue'));

const ui = useUiStore();
const entries = useEntriesStore();
const dicts = useDictionariesStore();

const capType = ref('tool');
const capText = ref('');

const pinned = computed(() => entries.pinned.filter((e) => e.status !== 'archived'));
const recent = computed(() =>
  entries.entries
    .filter((e) => !e.pinned && e.status !== 'archived')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 6),
);
const inbox = computed(() =>
  entries.entries
    .filter((e) => e.status === 'inbox')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
);
const trial = computed(() =>
  entries.entries
    .filter((e) => e.status === 'trying' || e.status === 'wishlist')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
);
const live = computed(() => entries.entries.filter((e) => e.status !== 'archived'));
const typeCounts = computed(() =>
  dicts.types
    .map((t) => ({ t, n: live.value.filter((e) => e.type === t.id).length }))
    .filter((x) => x.n > 0),
);
const isEmpty = computed(() => entries.entries.length === 0);

async function capture() {
  const t = capText.value.trim();
  if (!t) return;
  await entries.capture(capType.value, t);
  ui.showToast('已存入待整理');
  capText.value = '';
}
</script>

<template>
  <!-- 结构决定“工作台”怎么组织（04-frontend：结构同时作用于工作台与条目两类页面）。
       非三栏结构的工作台与条目页共用浏览视图（原型行为：browse(home) 渲染对应结构）。 -->
  <DocsBrowse v-if="ui.layout === 'docs'" />
  <GalleryBrowse v-else-if="ui.layout === 'gallery'" />
  <LauncherBrowse v-else-if="ui.layout === 'launcher'" />
  <BoardBrowse v-else-if="ui.layout === 'board'" />
  <div v-else class="page">
    <!-- 首次使用引导（档案为空） -->
    <div v-if="isEmpty" class="onboarding" data-testid="onboarding">
      <h1>欢迎使用 AI 工作台</h1>
      <p class="lede">
        这是一份记录你在用的 AI 工具、提示词、Skill、MCP、Hook、插件和配置的私人档案。
        从下面任意一个入口开始：
      </p>
      <div class="entries-cards">
        <div class="card">
          <h2>导入原型数据</h2>
          <p>把原型的 21 条示例条目导入进来，先看看界面长什么样。</p>
          <router-link class="btn btn-primary" to="/settings">去导入</router-link>
        </div>
        <div class="card">
          <h2>新建第一条</h2>
          <p>把你正在用的某个工具记下来；先用快速记录也行。</p>
          <router-link class="btn" to="/new">新建条目</router-link>
        </div>
        <div class="card">
          <h2>让 AI 收集本机配置</h2>
          <p>按数据收集规则说明，让 AI 代理读取本机配置、脱敏后经提案写入。</p>
          <router-link class="btn" to="/settings">查看说明</router-link>
        </div>
      </div>
    </div>

    <template v-else>
      <!-- 快速记录 -->
      <form class="capture" autocomplete="off" @submit.prevent="capture">
        <label class="sr-only" for="cap-type">类型</label>
        <select id="cap-type" v-model="capType">
          <option v-for="t in dicts.types" :key="t.id" :value="t.id">{{ t.name }}</option>
        </select>
        <label class="sr-only" for="cap-text">内容</label>
        <input
          id="cap-text"
          v-model="capText"
          placeholder="记下名字、链接或提示词"
          required
          data-testid="capture-input"
        />
        <button class="btn btn-primary" type="submit" data-testid="capture-submit">
          存入待整理
        </button>
      </form>
      <p class="capture-hint">
        先记下来，有空再补全字段。搜索按 <kbd>Ctrl K</kbd>，在搜索结果上按
        <kbd>Ctrl Enter</kbd> 直接复制第一个片段。
      </p>

      <div class="board-grid">
        <div>
          <h2>
            置顶 <span class="count">{{ pinned.length }}</span>
          </h2>
          <div class="panel" data-testid="pinned-panel">
            <EntryRow v-for="e in pinned" :key="e.id" :entry="e" />
            <div v-if="!pinned.length" class="panel-empty">
              在条目详情里点“置顶”，常用的配置会出现在这里。
            </div>
          </div>
          <h2>最近更新</h2>
          <div class="panel" data-testid="recent-panel">
            <EntryRow v-for="e in recent" :key="e.id" :entry="e" />
            <div v-if="!recent.length" class="panel-empty">还没有条目。</div>
          </div>
        </div>
        <div>
          <h2>
            在用的构成 <span class="count">{{ live.length }} 条</span>
          </h2>
          <div class="spread" role="img" aria-label="各类型条目数量">
            <span
              v-for="x in typeCounts"
              :key="x.t.id"
              :data-type="x.t.id"
              :style="{ flex: x.n }"
            ></span>
          </div>
          <ul class="legend">
            <li v-for="x in typeCounts" :key="x.t.id">
              <router-link :to="`/list/${x.t.id}`">
                <span class="swatch" :data-type="x.t.id"></span>{{ x.t.name
                }}<span class="num">{{ x.n }}</span>
              </router-link>
            </li>
          </ul>

          <h2 style="margin-top: 28px">
            待整理 <span class="count">{{ inbox.length }}</span>
          </h2>
          <div class="panel" data-testid="inbox-panel">
            <EntryRow v-for="e in inbox" :key="e.id" :entry="e" />
            <div v-if="!inbox.length" class="panel-empty">收件箱是空的。</div>
          </div>

          <h2 style="margin-top: 28px">
            试用中与想试 <span class="count">{{ trial.length }}</span>
          </h2>
          <div class="panel" data-testid="trial-panel">
            <EntryRow v-for="e in trial" :key="e.id" :entry="e" />
            <div v-if="!trial.length" class="panel-empty">没有待评估的条目。</div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.onboarding .lede {
  max-width: 62ch;
}
.entries-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
  margin-top: 16px;
}
.card {
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  padding: 20px;
  background: var(--surface);
}
.card h2 {
  margin: 0 0 8px;
  font-size: 16px;
}
.card p {
  color: var(--muted);
  margin: 0 0 14px;
}
.capture {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 8px;
  padding: 10px;
  border: 1.5px solid var(--ink);
  border-radius: var(--r-lg);
  background: var(--surface);
}
.capture select,
.capture input {
  border: 0;
  background: transparent;
  padding: 6px 8px;
}
.capture select {
  border-right: 1px solid var(--line);
  border-radius: 0;
}
.capture input:focus-visible,
.capture select:focus-visible {
  outline-offset: -2px;
}
.capture-hint {
  margin: 8px 4px 0;
  font-size: 12px;
  color: var(--muted);
}
h2 {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0 0 10px;
  font-size: 16px;
  font-weight: 600;
}
h2 .count {
  font-size: 12px;
  font-weight: 400;
  color: var(--muted);
}
.board-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: 28px;
  margin-top: 32px;
}
.panel {
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
  overflow: hidden;
}
.panel :deep(.row) {
  border-bottom: 0;
  padding-top: 10px;
  padding-bottom: 10px;
}
.panel :deep(.row:last-child) {
  border-bottom: 0;
}
.panel-empty {
  padding: 14px 16px;
  color: var(--muted);
  font-size: 13px;
}
.spread {
  display: flex;
  height: 10px;
  border-radius: 999px;
  overflow: hidden;
  background: var(--soft);
  margin: 8px 0 10px;
}
.spread span {
  background: var(--tc);
}
.spread span + span {
  border-left: 2px solid var(--surface);
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 12px;
}
.legend a {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--muted);
  text-decoration: none;
}
.legend a:hover {
  color: var(--ink);
}
.legend .num {
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}
@media (max-width: 1100px) {
  .board-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 860px) {
  .capture {
    grid-template-columns: 1fr auto;
  }
  .capture-hint {
    display: none;
  }
  .capture select {
    grid-column: 1 / -1;
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }
}
</style>
