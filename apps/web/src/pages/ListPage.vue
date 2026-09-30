<script setup lang="ts">
// 条目页：按当前结构渲染浏览视图（08-ui-spec#界面结构）。
// 结构 1（三栏）为默认；2 卡片墙 / 3 搜索优先 / 4 看板 / 5 知识库 由 ui.layout 决定，懒加载。
import { computed, ref, watch, defineAsyncComponent } from 'vue';
import { useRoute } from 'vue-router';
import { useEntriesStore, useDictionariesStore } from '../stores/data';
import { useUiStore } from '../stores/ui';
import { scopeEntries } from '../lib/display';
import { STATUSES } from '@aikit/shared';
import EntryRow from '../components/EntryRow.vue';
import EntryDetail from '../components/EntryDetail.vue';
import FilterBar from '../components/FilterBar.vue';
import RevisionDrawer from '../components/RevisionDrawer.vue';

const GalleryBrowse = defineAsyncComponent(() => import('../components/browse/GalleryBrowse.vue'));
const LauncherBrowse = defineAsyncComponent(
  () => import('../components/browse/LauncherBrowse.vue'),
);
const BoardBrowse = defineAsyncComponent(() => import('../components/browse/BoardBrowse.vue'));
const DocsBrowse = defineAsyncComponent(() => import('../components/browse/DocsBrowse.vue'));

const route = useRoute();
const entries = useEntriesStore();
const dicts = useDictionariesStore();
const ui = useUiStore();

const browseView = computed(() => {
  switch (ui.layout) {
    case 'gallery':
      return GalleryBrowse;
    case 'launcher':
      return LauncherBrowse;
    case 'board':
      return BoardBrowse;
    case 'docs':
      return DocsBrowse;
    default:
      return null;
  }
});

const scope = computed(() => String(route.params.scope ?? 'all'));
const selectedId = computed(() => (route.params.id ? String(route.params.id) : null));
const filterBar = ref<InstanceType<typeof FilterBar> | null>(null);
const showHistory = ref(false);

// 切换列表范围时清空筛选（原型行为）
watch(scope, () => filterBar.value?.clearFilters());

const list = computed(() => {
  const base = scopeEntries(entries.entries, scope.value);
  const f = filterBar.value?.filters;
  if (!f) return base;
  let out = base;
  const isStatusScope = (STATUSES as readonly string[]).includes(scope.value);
  if (f.status && !isStatusScope) out = out.filter((e) => e.status === f.status);
  if (f.platform) out = out.filter((e) => e.platforms.includes(f.platform));
  if (f.tag) out = out.filter((e) => e.tags.includes(f.tag));
  const cmp =
    f.sort === 'title'
      ? (a: { title: string }, b: { title: string }) => a.title.localeCompare(b.title, 'zh')
      : f.sort === 'rating'
        ? (a: { rating: number }, b: { rating: number }) => b.rating - a.rating
        : (a: { updatedAt: string }, b: { updatedAt: string }) =>
            b.updatedAt.localeCompare(a.updatedAt);
  return [...out].sort(cmp);
});

const selected = computed(() => (selectedId.value ? entries.byId(selectedId.value) : undefined));

const isStatusScope = computed(() => (STATUSES as readonly string[]).includes(scope.value));
const newHref = computed(() =>
  dicts.types.some((t) => t.id === scope.value) ? `/new/${scope.value}` : '/new',
);

function onListKeydown(ev: KeyboardEvent) {
  // 列表获得焦点时：上下方向键移动选中项，回车打开（04-frontend）
  const rows = Array.from(document.querySelectorAll<HTMLElement>('.list .row'));
  if (!rows.length) return;
  const idx = rows.findIndex((r) => r.getAttribute('aria-current') === 'true');
  if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
    ev.preventDefault();
    const next = rows[idx + (ev.key === 'ArrowDown' ? 1 : -1)] ?? rows[idx];
    next?.focus();
    next?.click();
  }
}
</script>

<template>
  <component :is="browseView" v-if="browseView" />
  <div v-else class="split" :class="{ 'has-detail': Boolean(selectedId) }">
    <section class="list-pane" aria-label="条目列表" @keydown="onListKeydown">
      <FilterBar ref="filterBar" :scope="scope" :show-status="!isStatusScope" @change="() => {}" />
      <div class="list" data-testid="entry-list">
        <EntryRow v-for="e in list" :key="e.id" :entry="e" :current="e.id === selectedId" />
        <div v-if="!list.length" class="panel-empty">
          没有符合条件的条目。<router-link :to="newHref">新建一条</router-link>，或调整上面的筛选。
        </div>
      </div>
    </section>
    <section class="detail-pane" aria-label="条目详情">
      <EntryDetail
        v-if="selected"
        :key="selected.id"
        :entry="selected"
        @open-history="showHistory = true"
      />
      <div v-else class="empty-pane">
        <p>从左侧选一个条目查看详情。</p>
        <p><router-link class="btn" :to="newHref">新建条目</router-link></p>
      </div>
    </section>
  </div>
  <RevisionDrawer
    v-if="showHistory && selected"
    :entry-id="selected.id"
    @close="showHistory = false"
  />
</template>

<style scoped>
.split {
  display: grid;
  grid-template-columns: var(--list-w) minmax(0, 1fr);
  height: 100%;
}
.list-pane {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid var(--line);
}
.list {
  flex: 1;
  overflow-y: auto;
  margin: 0;
  padding: 0;
  list-style: none;
}
.detail-pane {
  min-width: 0;
  overflow-y: auto;
  background: var(--surface);
  view-transition-name: detail;
}
.empty-pane {
  display: grid;
  place-content: center;
  height: 100%;
  padding: 24px;
  text-align: center;
  color: var(--muted);
}
.panel-empty {
  padding: 14px 16px;
  color: var(--muted);
  font-size: 13px;
}

@media (max-width: 860px) {
  .split {
    display: block;
  }
  .split.has-detail .list-pane {
    display: none;
  }
  .split:not(.has-detail) .detail-pane {
    display: none;
  }
  .list-pane {
    border-right: 0;
  }
}
</style>
