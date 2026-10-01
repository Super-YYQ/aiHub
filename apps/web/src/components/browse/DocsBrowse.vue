<script setup lang="ts">
// 结构 5 知识库（原型 renderDocs）：目录树（记住收起）、文档页、右侧属性栏+本页目录。
import { computed, ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { STATUSES } from '@aikit/shared';
import { serializeEntry } from '@aikit/shared';
import { useEntriesStore, useStacksStore, useDictionariesStore } from '../../stores/data';
import { useUiStore } from '../../stores/ui';
import { scopeEntries, statusName, relDate, sortPinnedFirst } from '../../lib/display';
import SnippetBlock from '../../components/SnippetBlock.vue';
import MarkdownIt from 'markdown-it';

// html:false（05-security#内容安全）；链接新窗口打开
const md = new MarkdownIt({ html: false, linkify: false, breaks: true });
import RevisionDrawer from '../../components/RevisionDrawer.vue';

const route = useRoute();
const entries = useEntriesStore();
const stacks = useStacksStore();
const dicts = useDictionariesStore();
const ui = useUiStore();

const scope = computed(() => (route.name === 'list' ? String(route.params.scope ?? 'all') : 'all'));
const selectedId = computed(() => (route.params.id ? String(route.params.id) : null));
const showHistory = ref(false);

// 收起状态按设备保存在本地（08-ui-spec）
const closed = ref<Set<string>>(
  new Set(JSON.parse(localStorage.getItem('aikit.docsClosed') ?? '[]') as string[]),
);
// 同步真实状态：details 的 open 变了才写（Vue 渲染设置属性也会触发 toggle 事件）
function syncClosed(t: string, ev: Event) {
  const open = (ev.target as HTMLDetailsElement).open;
  const next = new Set(closed.value);
  if (open) next.delete(t);
  else next.add(t);
  closed.value = next;
  localStorage.setItem('aikit.docsClosed', JSON.stringify([...next]));
}

const tree = computed(() =>
  dicts.types
    .map((t) => ({
      t,
      items: sortPinnedFirst(
        entries.entries
          .filter((e) => e.type === t.id && e.status !== 'archived')
          .sort((a, b) => a.title.localeCompare(b.title, 'zh')),
      ),
    }))
    .filter((g) => g.items.length),
);

const current = computed(() => (selectedId.value ? entries.byId(selectedId.value) : undefined));

const renderedBody = computed(() => {
  if (!current.value) return '';
  return md
    .render(current.value.body || '')
    .replace(/<a href=/g, '<a target="_blank" rel="noopener noreferrer" href=');
});

const fields = computed(() =>
  current.value ? Object.entries(current.value.fields).filter(([, v]) => String(v).trim()) : [],
);
const sections = computed(() => {
  const e = current.value;
  if (!e) return [];
  const out: Array<{ id: string; title: string }> = [];
  if (e.snippets.length) out.push({ id: 'sec-snip', title: '片段' });
  if (fields.value.length) out.push({ id: 'sec-fields', title: '要点' });
  if (e.body) out.push({ id: 'sec-body', title: '笔记' });
  if (e.links.length) out.push({ id: 'sec-links', title: '链接' });
  return out;
});

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    block: 'start',
  });
}

async function copyMarkdown() {
  if (!current.value) return;
  try {
    await navigator.clipboard.writeText(
      serializeEntry(current.value, {
        stackName: (id) => stacks.stacks.find((s) => s.id === id)?.name ?? id,
      }),
    );
    ui.showToast('已复制为 Markdown');
  } catch {
    ui.showToast('复制失败');
  }
}

async function changeStatus(ev: Event) {
  if (!current.value) return;
  const status = (ev.target as HTMLSelectElement).value as (typeof STATUSES)[number];
  await entries.patch(current.value.id, { status });
  ui.showToast(`状态改为“${statusName(status)}”`);
}

async function togglePin() {
  if (!current.value) return;
  await entries.patch(current.value.id, { pinned: !current.value.pinned });
  ui.showToast(current.value.pinned ? '已取消置顶' : '已置顶');
}

const captureType = ref('tool');
const captureText = ref('');
onMounted(() => {
  const params = new URLSearchParams(location.search);
  const t = params.get('title');
  if (t) captureText.value = t;
});
async function capture() {
  const t = captureText.value.trim();
  if (!t) return;
  await entries.capture(captureType.value, t);
  ui.showToast('已存入待整理');
  captureText.value = '';
}
</script>

<template>
  <div class="doc-layout">
    <aside class="tree-nav" aria-label="目录">
      <div v-for="g in tree" :key="g.t.id" class="tree-group">
        <details :open="!closed.has(g.t.id)" @toggle="syncClosed(g.t.id, $event)">
          <summary :data-type="g.t.id">
            <span class="swatch" :data-type="g.t.id"></span>{{ g.t.name
            }}<span class="count">{{ g.items.length }}</span>
          </summary>
          <router-link
            v-for="e in g.items"
            :key="e.id"
            class="tree-leaf"
            :data-type="e.type"
            :to="`/list/${g.t.id}/${e.id}`"
            :aria-current="selectedId === e.id ? 'page' : undefined"
          >
            <span class="st" :class="`st-${e.status}`"></span><span class="t">{{ e.title }}</span>
          </router-link>
        </details>
      </div>
    </aside>

    <article v-if="current" class="doc" :data-type="current.type">
      <div class="crumbs">
        <router-link :to="`/list/${current.type}`">{{ dicts.typeName(current.type) }}</router-link>
        <span class="path" :data-type="current.type"><b>{{ current.type }}</b>/{{ current.slug }}</span>
      </div>
      <h1>{{ current.title }}</h1>
      <p v-if="current.summary" class="lede">{{ current.summary }}</p>
      <p v-if="current.status === 'inbox'" class="lede">
        这条还在待整理：<router-link :to="`/edit/${current.id}`">补全信息</router-link>。
      </p>

      <section v-if="current.snippets.length">
        <h2 id="sec-snip">片段</h2>
        <SnippetBlock v-for="s in current.snippets" :key="s.id" :snippet="s" />
      </section>
      <section v-if="fields.length">
        <h2 id="sec-fields">要点</h2>
        <dl class="kv">
          <template v-for="[k, v] in fields" :key="k">
            <dt>{{ k }}</dt>
            <dd>{{ v }}</dd>
          </template>
        </dl>
      </section>
      <section v-if="current.body">
        <h2 id="sec-body">笔记</h2>
        <div class="md" v-html="renderedBody"></div>
      </section>
      <section v-if="current.links.length">
        <h2 id="sec-links">链接</h2>
        <ul>
          <li v-for="l in current.links" :key="l.url">
            <a :href="l.url" target="_blank" rel="noopener noreferrer">{{ l.label || l.url }}</a>
          </li>
        </ul>
      </section>
    </article>

    <article v-else-if="route.name === 'list' && scope !== 'all'" class="doc">
      <div class="crumbs">目录</div>
      <h1>{{ dicts.typeName(scope) }}</h1>
      <p class="lede">{{ entries.entries.filter((e) => e.type === scope).length }} 条</p>
      <ul class="doc-index">
        <li v-for="e in scopeEntries(entries.entries, scope)" :key="e.id" :data-type="e.type">
          <router-link :to="`/list/${scope}/${e.id}`">
            <span class="t">{{ e.title }}</span>
            <span class="s">{{ e.summary }}</span>
          </router-link>
        </li>
      </ul>
    </article>

    <article v-else class="doc">
      <div class="crumbs">首页</div>
      <h1>我的 AI 工作台</h1>
      <p class="lede">
        共 {{ entries.entries.length }} 条，{{ stacks.stacks.length }}
        个环境。左侧目录按类型列出全部条目。
      </p>
      <form class="capture" autocomplete="off" @submit.prevent="capture">
        <label class="sr-only" for="docs-cap-type">类型</label>
        <select id="docs-cap-type" v-model="captureType">
          <option v-for="t in dicts.types" :key="t.id" :value="t.id">{{ t.name }}</option>
        </select>
        <label class="sr-only" for="docs-cap">内容</label>
        <input id="docs-cap" v-model="captureText" placeholder="记下名字、链接或提示词" required />
        <button class="btn btn-primary" type="submit">存入待整理</button>
      </form>
    </article>

    <aside v-if="current" class="doc-props" aria-label="属性">
      <h3>属性</h3>
      <dl class="kv">
        <dt>状态</dt>
        <dd>
          <select
            class="btn btn-sm"
            :value="current.status"
            aria-label="状态"
            @change="changeStatus"
          >
            <option v-for="s in STATUSES" :key="s" :value="s">{{ statusName(s) }}</option>
          </select>
        </dd>
        <dt>置顶</dt>
        <dd>
          <button class="btn btn-sm" type="button" @click="togglePin">
            {{ current.pinned ? '取消置顶' : '置顶' }}
          </button>
        </dd>
        <dt>平台</dt>
        <dd>{{ current.platforms.map((p) => dicts.platformName(p)).join('、') || '无' }}</dd>
        <dt>标签</dt>
        <dd>{{ current.tags.map((t) => `#${t}`).join(' ') || '无' }}</dd>
        <dt>环境</dt>
        <dd>
          <template v-if="current.stacks.length">
            <router-link v-for="r in current.stacks" :key="r.id" :to="`/stacks/${r.id}`">
              {{ stacks.stacks.find((s) => s.id === r.id)?.name ?? r.id }}
</router-link>（之间用顿号分隔）
          </template>
          <template v-else>无</template>
        </dd>
        <dt>更新</dt>
        <dd>{{ relDate(current.updatedAt) }}</dd>
      </dl>
      <div class="actions">
        <router-link class="btn btn-sm" :to="`/edit/${current.id}`">编辑</router-link>
        <button class="btn btn-sm" type="button" @click="copyMarkdown">复制为 Markdown</button>
        <button class="btn btn-sm" type="button" @click="showHistory = true">历史</button>
      </div>
      <div v-if="sections.length > 1" class="toc-wrap">
        <h3>本页目录</h3>
        <nav class="doc-toc">
          <button v-for="s in sections" :key="s.id" type="button" @click="scrollTo(s.id)">
            {{ s.title }}
          </button>
        </nav>
      </div>
    </aside>
  </div>
  <RevisionDrawer
    v-if="showHistory && current"
    :entry-id="current.id"
    @close="showHistory = false"
  />
</template>

<style scoped>
.doc-layout {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr) 240px;
  gap: 22px;
  max-width: 1320px;
  margin: 0 auto;
  padding: 24px 26px 56px;
}
.tree-nav {
  position: sticky;
  top: 0;
  max-height: calc(100vh - 120px);
  overflow-y: auto;
  align-self: start;
}
.tree-group details {
  border-radius: var(--r-md);
}
.tree-group summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  cursor: pointer;
  font-weight: 600;
  font-size: 13px;
  border-radius: var(--r-md);
}
.tree-group summary:hover {
  background: var(--soft);
}
.tree-group .count {
  margin-left: auto;
  font-size: 12px;
  font-weight: 400;
  color: var(--muted);
}
.tree-leaf {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px 5px 26px;
  font-size: 13px;
  color: var(--ink);
  text-decoration: none;
  border-radius: var(--r-md);
}
.tree-leaf:hover {
  background: var(--soft);
}
.tree-leaf[aria-current='page'] {
  background: var(--soft);
  font-weight: 600;
  box-shadow: inset 0 0 0 1px var(--line);
}
.doc {
  max-width: 74ch;
}
.crumbs {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 13px;
  color: var(--muted);
  margin-bottom: 10px;
}
.doc h1 {
  margin: 0 0 6px;
  font-size: 28px;
}
.lede {
  color: var(--muted);
  margin: 0 0 16px;
}
.doc section {
  margin-top: 26px;
}
.doc h2 {
  margin: 0 0 12px;
  font-size: 18px;
}
.kv {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 6px 16px;
  margin: 0;
}
.kv dt {
  color: var(--muted);
  font-size: 13px;
}
.kv dd {
  margin: 0;
  font-size: 13px;
}
.md {
  line-height: 1.8;
}
.md :deep(code) {
  padding: 1px 5px;
  border-radius: var(--r-sm);
  background: var(--soft);
}
.md :deep(pre) {
  padding: 12px 14px;
  border-radius: var(--r-md);
  background: var(--bg);
  overflow-x: auto;
}
.doc-props {
  position: sticky;
  top: 0;
  align-self: start;
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: var(--surface);
  padding: 16px;
}
.doc-props h3 {
  margin: 0 0 10px;
  font-size: 13px;
  color: var(--muted);
}
.doc-props .actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}
.toc-wrap {
  margin-top: 18px;
}
.doc-toc {
  display: grid;
  gap: 6px;
}
.doc-toc button {
  text-align: left;
  padding: 4px 8px;
  border: 0;
  background: none;
  color: var(--muted);
  cursor: pointer;
  border-radius: var(--r-sm);
  font-size: 13px;
}
.doc-toc button:hover {
  background: var(--soft);
  color: var(--ink);
}
.doc-index {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
.doc-index a {
  display: grid;
  gap: 2px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  text-decoration: none;
  color: inherit;
}
.doc-index a:hover {
  background: var(--soft);
}
.doc-index .s {
  color: var(--muted);
  font-size: 13px;
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
@media (max-width: 1100px) {
  .doc-layout {
    grid-template-columns: 240px minmax(0, 1fr);
  }
  .doc-props {
    display: none;
  }
}
@media (max-width: 860px) {
  .doc-layout {
    grid-template-columns: 1fr;
    padding: 14px;
  }
  .tree-nav {
    position: static;
    max-height: none;
  }
  .doc-props {
    display: block;
    position: static;
    order: -1;
    margin-bottom: 14px;
  }
}
</style>
