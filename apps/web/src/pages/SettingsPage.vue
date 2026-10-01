<script setup lang="ts">
// 数据与设置（04-frontend#页面规格）：外观、数据、字典、整理规则、关于。
import { computed, ref } from 'vue';
import { useUiStore, type LayoutId, type StyleId, type ThemePref } from '../stores/ui';
import { useEntriesStore, useStacksStore, useDictionariesStore } from '../stores/data';
import { serializeEntry, scanEntry } from '@aikit/shared';
import { api } from '../lib/api';
import { lastSyncTime, pendingCount } from '../lib/sync';

const ui = useUiStore();
const entries = useEntriesStore();
const stacks = useStacksStore();
const dicts = useDictionariesStore();

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

// ---------- 数据 ----------
const importing = ref(false);
const importMode = ref<'replace' | 'merge' | 'prototype'>('merge');
const importPreview = ref<{ imported: number; renamed: string[] } | null>(null);
const importFile = ref<File | null>(null);

function onImportFile(ev: Event) {
  const input = ev.target as HTMLInputElement;
  importFile.value = input.files?.[0] ?? null;
  importPreview.value = null;
}

async function previewImport() {
  if (!importFile.value) return;
  importing.value = true;
  try {
    // 预览：直接读文件给出将导入的数量
    const text = await importFile.value.text();
    const data = JSON.parse(text) as { entries?: unknown[] };
    importPreview.value = { imported: data.entries?.length ?? 0, renamed: [] };
  } catch {
    ui.showToast('导入失败：文件不是本工具导出的 JSON');
  }
  importing.value = false;
}

async function doImport() {
  if (!importFile.value) return;
  importing.value = true;
  try {
    const text = await importFile.value.text();
    const res = await fetch(`/api/import?mode=${importMode.value}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: text,
    });
    if (!res.ok) throw new Error((await res.json()).error?.message ?? String(res.status));
    const result = (await res.json()) as { imported: number; renamed: string[] };
    ui.showToast(
      `已导入 ${result.imported} 条${result.renamed.length ? `，重命名 ${result.renamed.length} 个标识` : ''}`,
    );
    importFile.value = null;
    importPreview.value = null;
    const { syncSoon } = await import('../lib/sync');
    await syncSoon();
    await Promise.all([entries.refresh(), stacks.refresh()]);
  } catch (err) {
    ui.showToast((err as Error).message || '导入失败');
  }
  importing.value = false;
}

async function exportJson() {
  try {
    const data = await api.get<Record<string, unknown>>('/export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ai-kit-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    ui.showToast('已导出 JSON');
  } catch {
    ui.showToast('导出失败');
  }
}

async function exportMarkdown() {
  try {
    const parts: string[] = [];
    for (const e of entries.entries) {
      parts.push(
        serializeEntry(e, {
          stackName: (id) => stacks.stacks.find((s) => s.id === id)?.name ?? id,
        }),
      );
    }
    const blob = new Blob([parts.join('\n\n')], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ai-kit-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    ui.showToast('已导出 Markdown');
  } catch {
    ui.showToast('导出失败');
  }
}

// ---------- 整理规则 ----------
const rulesText = ref('');
const rulesLoaded = ref(false);
async function loadRules() {
  rulesText.value = await api.getRules();
  rulesLoaded.value = true;
}
void loadRules();

const rulesDirty = computed(() => rulesText.value !== dicts.rules);

async function saveRules() {
  const findings = scanEntry({ body: rulesText.value });
  if (findings.length) {
    ui.showToast('整理规则里疑似包含密钥，请改成 ${环境变量名} 这样的占位符');
    return;
  }
  try {
    await fetch('/api/settings/rules', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: rulesText.value }),
    });
    dicts.rules = rulesText.value;
    ui.showToast('已保存整理规则');
  } catch (err) {
    ui.showToast((err as Error).message ?? '保存失败');
  }
}

// ---------- 关于 ----------
const syncAt = ref<string | null>(null);
const outboxCount = ref(0);
async function refreshAbout() {
  syncAt.value = await lastSyncTime();
  outboxCount.value = await pendingCount();
}
void refreshAbout();

const statusText = computed(() => {
  switch (ui.syncStatus) {
    case 'syncing':
      return '同步中';
    case 'offline':
      return '离线';
    case 'conflict':
      return '有冲突';
    default:
      return '已同步';
  }
});
</script>

<template>
  <div class="page settings">
    <section>
      <h2>界面结构</h2>
      <p>结构决定页面怎么组织，可以和任意配色组合，随时切换；设置保存在这台设备上。</p>
      <div class="style-cards">
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
    </section>

    <section>
      <h2>配色方案</h2>
      <p>配色只改颜色、圆角和阴影。</p>
      <div class="style-cards">
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
      <div class="actions">
        <button
          v-for="t in THEMES"
          :key="t.id"
          class="btn"
          type="button"
          :aria-pressed="ui.themePref === t.id"
          @click="ui.setThemePref(t.id)"
        >
          {{ t.name }}
        </button>
      </div>
    </section>

    <section>
      <h2>导出与导入</h2>
      <p>
        导出的 JSON 可以在另一台设备上导入。导入时先选模式：replace 覆盖当前全部数据；merge 按 ID
        合并、标识冲突自动加后缀；prototype 导入原型的数据。
      </p>
      <div class="actions">
        <button class="btn" type="button" data-testid="export-json" @click="exportJson">
          导出 JSON
        </button>
        <button class="btn" type="button" data-testid="export-md" @click="exportMarkdown">
          导出全部为 Markdown
        </button>
        <label class="btn">
          导入 JSON
          <input
            type="file"
            accept="application/json,.json"
            data-testid="import-file"
            hidden
            @change="onImportFile"
          />
        </label>
      </div>
      <div v-if="importFile" class="import-box" data-testid="import-box">
        <div class="actions">
          <label class="field">
            <span>模式</span>
            <select v-model="importMode">
              <option value="replace">replace（覆盖）</option>
              <option value="merge">merge（合并）</option>
              <option value="prototype">prototype（原型数据）</option>
            </select>
          </label>
          <button class="btn" type="button" @click="previewImport">预览数量</button>
          <button
            class="btn btn-primary"
            type="button"
            :disabled="importing"
            data-testid="import-confirm"
            @click="doImport"
          >
            确认导入
          </button>
        </div>
        <p v-if="importPreview" class="hint">
          将导入 {{ importPreview.imported }} 条数据。<template v-if="importMode === 'replace'">
            当前全部数据会被覆盖，建议先导出。
</template>
        </p>
      </div>
    </section>

    <section>
      <h2>字典</h2>
      <p>类型、平台和标签的管理入口。</p>
      <div class="actions">
        <router-link class="btn" to="/settings/types">类型</router-link>
        <router-link class="btn" to="/settings/platforms">平台</router-link>
        <router-link class="btn" to="/settings/tags">标签</router-link>
      </div>
    </section>

    <section>
      <h2>整理规则</h2>
      <p>AI 整理档案时遵循的规则（也通过 MCP 提供给 AI）。</p>
      <label class="sr-only" for="rules">整理规则</label>
      <textarea id="rules" v-model="rulesText" rows="10" data-testid="rules-editor"></textarea>
      <div class="actions" style="margin-top: 8px">
        <button
          class="btn btn-primary"
          type="button"
          :disabled="!rulesDirty"
          data-testid="rules-save"
          @click="saveRules"
        >
          保存整理规则
        </button>
      </div>
    </section>

    <section>
      <h2>关于</h2>
      <dl class="kv">
        <dt>版本</dt>
        <dd>{{ $route.meta.version ?? '0.1.0' }}</dd>
        <dt>同步状态</dt>
        <dd>
          {{ statusText }}<template v-if="outboxCount"> · 待上传 {{ outboxCount }} 条</template>
        </dd>
        <dt>上次同步</dt>
        <dd>{{ syncAt ? syncAt.replace('T', ' ').slice(0, 19) : '还没有同步过' }}</dd>
      </dl>
      <div class="actions" style="margin-top: 8px">
        <button class="btn" type="button" @click="refreshAbout">刷新</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.settings section {
  margin-top: 28px;
  max-width: 640px;
}
.settings h2 {
  margin: 0 0 6px;
  font-size: 16px;
}
.settings p {
  margin: 0 0 12px;
  color: var(--muted);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: end;
}
.style-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}
.style-cards button {
  display: grid;
  gap: 4px;
  padding: 12px 14px;
  text-align: left;
  cursor: pointer;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
}
.style-cards button[aria-pressed='true'] {
  border-color: var(--ink);
  box-shadow: inset 0 0 0 1px var(--ink);
}
.style-cards small {
  color: var(--muted);
}
.import-box {
  margin-top: 12px;
  padding: 14px;
  border: 1px dashed var(--line);
  border-radius: var(--r-md);
}
.import-box .field {
  display: grid;
  gap: 4px;
}
.import-box select {
  padding: 6px 8px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
}
.hint {
  margin-top: 8px;
  font-size: 12px;
  color: var(--muted);
}
textarea#rules {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
  font-size: 13px;
  line-height: 1.7;
  resize: vertical;
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
}
</style>
