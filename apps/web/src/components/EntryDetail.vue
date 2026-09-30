<script setup lang="ts">
// 条目详情（原型 detail）：头部操作、正文各区块、历史入口。
import { computed } from 'vue';
import type { Entry } from '@aikit/shared';
import { STATUSES, serializeEntry } from '@aikit/shared';
import { useEntriesStore, useStacksStore, useDictionariesStore } from '../stores/data';
import { useUiStore } from '../stores/ui';
import { statusName, relDate } from '../lib/display';
import SnippetBlock from './SnippetBlock.vue';
import MarkdownIt from 'markdown-it';

// Markdown 渲染：html: false（05-security#内容安全）
const md = new MarkdownIt({ html: false, linkify: false, breaks: true });

const props = defineProps<{ entry: Entry; showHistory?: boolean }>();
const entries = useEntriesStore();
const stacksStore = useStacksStore();
const dicts = useDictionariesStore();
const ui = useUiStore();

const emit = defineEmits<{ openHistory: [] }>();

const chips = computed(() => [
  ...props.entry.platforms.map((p) => ({
    text: dicts.platformName(p),
    to: undefined as string | undefined,
  })),
  ...props.entry.tags.map((t) => ({ text: `#${t}`, to: undefined })),
]);

const fields = computed(() =>
  Object.entries(props.entry.fields).filter(([, v]) => String(v).trim()),
);

// html:false + 用户内容不进 v-html 之外的路径；链接在新窗口打开
const renderedBody = computed(() => {
  const html = md.render(props.entry.body || '');
  return html.replace(/<a href=/g, '<a target="_blank" rel="noopener noreferrer" href=');
});
const stacks = computed(() =>
  props.entry.stacks
    .map((r) => ({ ref: r, stack: stacksStore.stacks.find((s) => s.id === r.id) }))
    .filter((x) => x.stack),
);

async function copyMarkdown() {
  try {
    const md = serializeEntry(props.entry, {
      stackName: (id) => stacksStore.stacks.find((s) => s.id === id)?.name ?? id,
    });
    await navigator.clipboard.writeText(md);
    ui.showToast('已复制为 Markdown');
  } catch {
    ui.showToast('复制失败');
  }
}

async function changeStatus(ev: Event) {
  const status = (ev.target as HTMLSelectElement).value as Entry['status'];
  await entries.patch(props.entry.id, { status });
  ui.showToast(`状态改为“${statusName(status)}”`);
}

async function togglePin() {
  await entries.patch(props.entry.id, { pinned: !props.entry.pinned });
  ui.showToast(props.entry.pinned ? '已取消置顶' : '已置顶');
}
</script>

<template>
  <article class="detail" :data-type="entry.type">
    <div class="detail-top">
      <span class="type-badge" :data-type="entry.type">{{ dicts.typeName(entry.type) }}</span>
      <span class="path" :data-type="entry.type">
        <b>{{ entry.type }}</b
        >/{{ entry.slug }}</span
      >
      <div class="detail-actions">
        <select
          class="btn btn-sm"
          :value="entry.status"
          aria-label="状态"
          data-testid="status-select"
          @change="changeStatus"
        >
          <option v-for="s in STATUSES" :key="s" :value="s">{{ statusName(s) }}</option>
        </select>
        <button class="btn btn-sm" type="button" data-testid="pin-button" @click="togglePin">
          {{ entry.pinned ? '取消置顶' : '置顶' }}
        </button>
        <button class="btn btn-sm" type="button" data-testid="copy-md" @click="copyMarkdown">
          复制为 Markdown
        </button>
        <router-link class="btn btn-sm" :to="`/edit/${entry.id}`">编辑</router-link>
      </div>
    </div>
    <h1>{{ entry.title }}</h1>
    <p v-if="entry.summary" class="lede">{{ entry.summary }}</p>
    <div v-if="chips.length || stacks.length" class="detail-meta">
      <span v-for="c in chips" :key="c.text" class="chip">{{ c.text }}</span>
      <router-link v-for="s in stacks" :key="s.ref.id" class="chip" :to="`/stacks/${s.ref.id}`">
        ▤ {{ s.stack?.name }}<template v-if="s.ref.note">（{{ s.ref.note }}）</template>
      </router-link>
    </div>
    <p v-if="entry.status === 'inbox'" class="lede inbox-hint">
      这条还在待整理：<router-link :to="`/edit/${entry.id}`">补全信息</router-link
      >后，把状态改成“在用”或“想试”。
    </p>

    <section v-if="entry.snippets.length">
      <h3>片段</h3>
      <SnippetBlock v-for="s in entry.snippets" :key="s.id" :snippet="s" />
    </section>

    <section v-if="fields.length">
      <h3>要点</h3>
      <dl class="kv">
        <template v-for="[k, v] in fields" :key="k">
          <dt>{{ k }}</dt>
          <dd>{{ v }}</dd>
        </template>
      </dl>
    </section>

    <section v-if="entry.body">
      <h3>笔记</h3>
      <div class="md" v-html="renderedBody"></div>
    </section>

    <section v-if="entry.links.length">
      <h3>链接</h3>
      <ul>
        <li v-for="l in entry.links" :key="l.url">
          <a :href="l.url" target="_blank" rel="noopener noreferrer">{{ l.label || l.url }}</a>
        </li>
      </ul>
    </section>

    <section>
      <h3>记录</h3>
      <p class="path">
        创建于 {{ entry.createdAt.slice(0, 10) }}，更新于 {{ entry.updatedAt.slice(0, 10) }}（{{
          relDate(entry.updatedAt)
        }}）· v{{ entry.version }}
        <button
          class="btn btn-sm"
          type="button"
          data-testid="history-button"
          @click="emit('openHistory')"
        >
          查看历史
        </button>
      </p>
    </section>
  </article>
</template>

<style scoped>
.detail {
  max-width: 760px;
  padding: 28px 36px 64px;
}
.detail-top {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.detail h1 {
  margin: 10px 0 6px;
  font-size: 26px;
  line-height: 1.3;
}
.lede {
  margin: 0 0 14px;
  font-size: 15px;
  color: var(--muted);
  max-width: 62ch;
}
.inbox-hint a {
  color: var(--focus);
}
.detail-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 18px;
}
.detail-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
  flex-wrap: wrap;
}
.detail section {
  margin-top: 26px;
}
.detail h3 {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--muted);
}
.kv {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 6px 20px;
  margin: 0;
}
.kv dt {
  color: var(--muted);
}
.kv dd {
  margin: 0;
  word-break: break-word;
}
.md {
  max-width: 68ch;
  line-height: 1.75;
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
.md :deep(a) {
  color: var(--focus);
}

@media (max-width: 860px) {
  .detail {
    padding: 20px 18px 40px;
  }
  .detail h1 {
    font-size: 22px;
  }
  .detail-actions {
    margin-left: 0;
    width: 100%;
  }
}
</style>
