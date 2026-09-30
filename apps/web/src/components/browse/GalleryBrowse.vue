<script setup lang="ts">
// 结构 2 卡片墙（原型 renderGallery）：类型分组卡片、卡片直接复制、详情右侧抽屉。
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { parseVariables, applyVariables, STATUSES } from '@aikit/shared';
import { useEntriesStore, useDictionariesStore } from '../../stores/data';
import { useUiStore } from '../../stores/ui';
import { scopeEntries, statusName } from '../../lib/display';
import TypeTabs from '../../components/TypeTabs.vue';
import FilterBar from '../../components/FilterBar.vue';
import DetailDrawer from '../../components/DetailDrawer.vue';

const route = useRoute();
const router = useRouter();
const entries = useEntriesStore();
const dicts = useDictionariesStore();
const ui = useUiStore();

const scope = computed(() => String(route.params.scope ?? 'all'));
const selectedId = computed(() => (route.params.id ? String(route.params.id) : null));
const filterBar = ref<InstanceType<typeof FilterBar> | null>(null);

const list = computed(() => {
  const base = scopeEntries(entries.entries, scope.value);
  const f = filterBar.value?.filters;
  if (!f) return base;
  let out = base;
  const isStatusScope = (STATUSES as readonly string[]).includes(scope.value);
  if (f.status && !isStatusScope) out = out.filter((e) => e.status === f.status);
  if (f.platform) out = out.filter((e) => e.platforms.includes(f.platform));
  if (f.tag) out = out.filter((e) => e.tags.includes(f.tag));
  return out;
});

const groups = computed(() => {
  const all = dicts.types;
  return all
    .map((t) => ({ t, items: list.value.filter((e) => e.type === t.id) }))
    .filter((g) => g.items.length);
});

async function quickCopy(entryId: string) {
  const e = entries.byId(entryId);
  const s = e?.snippets[0];
  if (!e || !s) {
    ui.showToast('这个条目没有片段可复制');
    return;
  }
  if (parseVariables(s.code).length) {
    // 有变量：打开详情让用户填写（原型行为）
    router.push(`/list/${scope.value}/${e.id}`);
    ui.showToast('这个片段有变量，填好后再复制');
    return;
  }
  try {
    await navigator.clipboard.writeText(applyVariables(s.code, {}));
    ui.showToast(`已复制：${e.title}`);
  } catch {
    ui.showToast('复制失败');
  }
}
</script>

<template>
  <div class="gallery">
    <div class="gallery-tools">
      <TypeTabs />
      <FilterBar
        ref="filterBar"
        :scope="scope"
        :show-status="!(STATUSES as readonly string[]).includes(scope)"
        @change="() => {}"
      />
    </div>
    <section
      v-for="g in groups"
      :key="g.t.id"
      class="group"
      :data-testid="`gallery-group-${g.t.id}`"
    >
      <h2>
        <span class="swatch" :data-type="g.t.id"></span>{{ g.t.name }}
        <span class="count">{{ g.items.length }}</span>
      </h2>
      <div class="card-grid">
        <article
          v-for="e in g.items"
          :key="e.id"
          class="card"
          :data-type="e.type"
          :data-testid="`gallery-card-${e.id}`"
        >
          <router-link
            class="card-link"
            :to="`/list/${scope}/${e.id}`"
            :aria-label="`查看 ${e.title}`"
          ></router-link>
          <div class="card-content">
            <div class="card-top">
              <span class="type-badge" :data-type="e.type">{{ dicts.typeName(e.type) }}</span>
              <span v-if="e.pinned" class="pin">置顶</span>
              <span class="st" :class="`st-${e.status}`">{{ statusName(e.status) }}</span>
            </div>
            <h3 class="card-title">{{ e.title }}</h3>
            <p v-if="e.summary" class="card-summary">{{ e.summary }}</p>
            <div v-if="e.snippets.length" class="card-snip">
              <code>{{ e.snippets[0].code.split('\n')[0] }}</code>
              <button
                class="btn btn-sm"
                type="button"
                :data-testid="`gallery-copy-${e.id}`"
                @click="quickCopy(e.id)"
              >
                {{ parseVariables(e.snippets[0].code).length ? '填变量' : '复制' }}
              </button>
            </div>
            <div v-if="e.tags.length" class="card-foot">
              <span v-for="t in e.tags.slice(0, 3)" :key="t" class="chip">#{{ t }}</span>
            </div>
          </div>
        </article>
      </div>
    </section>
    <div v-if="!groups.length" class="panel-empty">
      没有符合条件的条目。调整筛选，或用上面的输入框记一条。
    </div>
    <DetailDrawer v-if="selectedId" :entry-id="selectedId" @close="router.push(`/list/${scope}`)" />
  </div>
</template>

<style scoped>
.gallery {
  padding: 20px 24px 48px;
  max-width: 1280px;
  margin: 0 auto;
}
.gallery-tools {
  display: grid;
  gap: 10px;
  margin-bottom: 8px;
}
.group h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 26px 0 12px;
  font-size: 16px;
}
.group .count {
  font-size: 12px;
  font-weight: 400;
  color: var(--muted);
}
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 14px;
}
.card {
  position: relative;
  display: grid;
  gap: 8px;
  padding: 14px 16px;
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: var(--surface);
  box-shadow: var(--shadow-1, none);
  align-content: start;
}
.card:hover {
  box-shadow: var(--shadow-2, none);
}
.card-link {
  position: absolute;
  inset: 0;
  z-index: 2;
  border-radius: inherit;
}
.card-content {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 8px;
}
.card-top {
  display: flex;
  align-items: center;
  gap: 8px;
}
.card-top .st {
  margin-left: auto;
}
.pin {
  font-size: 12px;
  color: var(--ink);
}
.card-title {
  margin: 0;
  font-size: 15px;
}
.card-summary {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.card-snip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: var(--r-md);
  background: var(--soft);
}
.card-snip code {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}
.card-snip .btn {
  position: relative;
  z-index: 3;
}
.card-foot {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.panel-empty {
  margin-top: 24px;
  padding: 20px;
  text-align: center;
  color: var(--muted);
}
@media (max-width: 860px) {
  .gallery {
    padding: 14px 14px 40px;
  }
  .card-grid {
    grid-template-columns: 1fr;
  }
}
</style>
