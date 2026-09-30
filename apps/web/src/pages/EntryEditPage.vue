<script setup lang="ts">
// 条目新建与编辑（原型 editor）：字段、片段增删移动、平台/环境勾选、Ctrl+S。
import { computed, reactive, ref, onMounted, onBeforeUnmount, toRaw } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { STATUSES } from '@aikit/shared';
import { scanEntry } from '@aikit/shared';
import { useEntriesStore, useStacksStore, useDictionariesStore } from '../stores/data';
import { useUiStore } from '../stores/ui';
import { statusName } from '../lib/display';

const route = useRoute();
const router = useRouter();
const entries = useEntriesStore();
const stacksStore = useStacksStore();
const dicts = useDictionariesStore();
const ui = useUiStore();

const isEdit = computed(() => route.name === 'edit');
const editing = computed(() => (isEdit.value ? entries.byId(String(route.params.id)) : undefined));

const RATING_OPTIONS = [0, 1, 2, 3, 4, 5].map((n) => ({
  id: String(n),
  name: n ? '★'.repeat(n) : '未评分',
}));

const form = reactive({
  type: (route.params.type as string) || 'tool',
  title: (route.query.title as string) || '',
  slug: '',
  summary: '',
  status: 'using',
  rating: 0,
  pinned: false,
  platforms: [] as string[],
  tags: '',
  stacks: [] as string[],
  fields: '',
  body: '',
});
const snippets = reactive<Array<{ label: string; lang: string; code: string; install: boolean }>>(
  [],
);
const links = ref('');
const fieldErrors = ref<Record<string, string>>({});

onMounted(() => {
  // “修改后接受”进入：带上提案草稿（待确认页存进 sessionStorage）
  const proposalParam = new URLSearchParams(location.search).get('proposal');
  if (proposalParam) {
    try {
      const saved = JSON.parse(sessionStorage.getItem('aikit.proposalDraft') ?? 'null') as {
        proposalId: string;
        targetEntryId: string | null;
        draft: Record<string, unknown>;
      } | null;
      if (saved && saved.proposalId === proposalParam) {
        const d = saved.draft;
        form.type = (d.type as string) ?? form.type;
        form.title = (d.title as string) ?? '';
        form.slug = (d.slug as string) ?? '';
        form.summary = (d.summary as string) ?? '';
        form.status = (d.status as string) ?? form.status;
        form.tags = ((d.tags as string[]) ?? []).join(', ');
        form.fields = Object.entries((d.fields as Record<string, string>) ?? {})
          .map(([k, v]) => `${k}: ${v}`)
          .join('\n');
        form.body = (d.body as string) ?? '';
        snippets.push(
          ...(
            (d.snippets as Array<{
              label?: string;
              lang?: string;
              code: string;
              install?: boolean;
            }>) ?? []
          ).map((sn) => ({
            label: sn.label ?? '',
            lang: sn.lang ?? 'text',
            code: sn.code,
            install: Boolean(sn.install),
          })),
        );
        links.value = ((d.links as Array<{ label?: string; url: string }>) ?? [])
          .map((l) => `${l.label ?? ''} | ${l.url}`)
          .join('\n');
        ui.showToast('已载入提案草稿，保存时会在提交后接受提案');
        return;
      }
    } catch {
      /* 草稿损坏则按普通编辑处理 */
    }
  }
  if (editing.value) {
    const e = editing.value;
    form.type = e.type;
    form.title = e.title;
    form.slug = e.slug;
    form.summary = e.summary;
    form.status = e.status;
    form.rating = e.rating;
    form.pinned = e.pinned;
    form.platforms = [...e.platforms];
    form.tags = e.tags.join(', ');
    form.stacks = e.stacks.map((r) => r.id);
    form.fields = Object.entries(e.fields)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
    form.body = e.body;
    snippets.push(
      ...e.snippets.map((s) => ({
        label: s.label,
        lang: s.lang,
        code: s.code,
        install: Boolean(s.install),
      })),
    );
    links.value = e.links.map((l) => `${l.label || ''} | ${l.url}`).join('\n');
  } else {
    snippets.push({ label: '', lang: 'bash', code: '', install: false });
  }
  window.addEventListener('keydown', onKeyDown);
});
onBeforeUnmount(() => window.removeEventListener('keydown', onKeyDown));

/** “修改后接受”流：带 ?proposal= 进入时，保存后用新内容接受该提案。 */
async function acceptProposalIfAny(): Promise<void> {
  const proposalId = new URLSearchParams(location.search).get('proposal');
  if (!proposalId) return;
  try {
    const res = await fetch(`/api/proposals/${proposalId}/accept`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ payload: buildDraft() }),
    });
    if (res.ok) ui.showToast('提案已接受');
    else ui.showToast('提案接受失败，可到待确认页重试');
    sessionStorage.removeItem('aikit.proposalDraft');
  } catch {
    ui.showToast('提案接受失败，可到待确认页重试');
  }
}

function onKeyDown(ev: KeyboardEvent) {
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') {
    ev.preventDefault();
    void save();
  }
}

const fieldHint = computed(() => {
  const t = dicts.types.find((x) => x.id === form.type);
  return (t?.fieldTemplate ?? []).map((f) => `${f}: `).join('\n');
});

function addSnippet() {
  snippets.push({ label: '', lang: 'bash', code: '', install: false });
}
function removeSnippet(i: number) {
  snippets.splice(i, 1);
}
function moveSnippet(i: number, dir: -1 | 1) {
  const j = i + dir;
  if (j < 0 || j >= snippets.length) return;
  const [item] = snippets.splice(i, 1);
  snippets.splice(j, 0, item);
}

function buildDraft() {
  // 去响应式：outbox 写入 IndexedDB 需要可结构化克隆的普通对象
  const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(toRaw(v))) as T;
  const fields: Record<string, string> = {};
  for (const line of form.fields.split('\n')) {
    const i = line.search(/[:：]/);
    if (i > 0 && line.slice(i + 1).trim())
      fields[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  const linkList = links.value
    .split('\n')
    .map((line) => {
      const [a, b] = line.split('|').map((x) => x.trim());
      if (b) return { label: a || b, url: b };
      if (/^https?:/.test(a ?? '')) return { label: a, url: a };
      return null;
    })
    .filter((x): x is { label: string; url: string } => Boolean(x));

  return clone({
    type: form.type,
    slug: form.slug.trim() || undefined,
    title: form.title.trim(),
    summary: form.summary.trim(),
    status: form.status,
    rating: Number(form.rating) || 0,
    pinned: form.pinned,
    platforms: form.platforms,
    tags: form.tags
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean),
    fields,
    snippets: snippets
      .filter((s) => s.code.trim())
      .map((s) => ({
        label: s.label.trim(),
        lang: s.lang.trim() || 'text',
        code: s.code,
        install: s.install,
      })),
    links: linkList,
    body: form.body,
  });
}

async function save() {
  fieldErrors.value = {};
  if (!form.title.trim()) {
    fieldErrors.value.title = '请填写名称';
    return;
  }
  const draft = buildDraft();

  // 前端预校验密钥（05-security：保存前提示）
  const findings = scanEntry(draft);
  if (findings.length) {
    fieldErrors.value[findings[0].path.split('.')[0]] =
      '内容里疑似包含密钥，请改成 ${环境变量名} 这样的占位符';
    return;
  }

  try {
    if (isEdit.value && editing.value) {
      await entries.update(editing.value.id, draft);
      // 同步环境成员
      await syncStackMembership(editing.value.id, form.stacks);
      await acceptProposalIfAny();
      ui.showToast('已保存修改');
      router.push(`/list/all/${editing.value.id}`);
    } else {
      // “修改后接受”创建提案：条目由提案接受落库（03-api：accept 可带用户改过的 payload），
      // 编辑器不再本地重复建一条。
      const proposalId = new URLSearchParams(location.search).get('proposal');
      if (proposalId) {
        await acceptProposalIfAny();
        const { syncSoon } = await import('../lib/sync');
        await syncSoon();
        ui.showToast('已按修改后的内容接受提案');
        router.push('/list/all');
        return;
      }
      const created = await entries.create(draft);
      await syncStackMembership(created.id, form.stacks);
      ui.showToast('已新建条目');
      router.push(`/list/all/${created.id}`);
    }
  } catch (err) {
    // 服务端校验错误显示在对应字段下方
    const e = err as {
      code?: string;
      message?: string;
      details?: Array<{ path: string; message: string }>;
    };
    if (e.code === 'secret_detected' || e.code === 'validation_failed') {
      for (const d of e.details ?? []) {
        fieldErrors.value[String(d.path).split('.')[0]] = d.message ?? '内容没有通过校验';
      }
    } else {
      fieldErrors.value.title = e.message ?? '保存失败，请稍后重试';
    }
  }
}

async function syncStackMembership(entryId: string, targetStackIds: string[]) {
  const current = new Set((editing.value?.stacks ?? []).map((r) => r.id));
  const target = new Set(targetStackIds);
  const add = [...target].filter((x) => !current.has(x)).map(() => ({ entryId, note: '' }));
  const remove = [...current].filter((id) => !target.has(id));
  if (add.length || remove.length) {
    // 逐个环境调整（单用户量小）
    for (const stackId of [...target].filter((x) => !current.has(x))) {
      await stacksStore.setEntries(stackId, { add: [{ entryId, note: '' }], remove: [] });
    }
    for (const stackId of remove) {
      await stacksStore.setEntries(stackId, { add: [], remove: [entryId] });
    }
  }
}

async function remove() {
  if (!editing.value) return;
  if (!confirm(`删除“${editing.value.title}”？删除后不能恢复。`)) return;
  await entries.remove(editing.value.id);
  ui.showToast('已删除');
  router.push('/list/all');
}

const dirty = computed(() => Boolean(form.title || form.summary || form.body));
function confirmLeave(): boolean {
  return !dirty.value || confirm('有未保存的修改，确定离开？');
}
</script>

<template>
  <div class="page">
    <form class="form" autocomplete="off" @submit.prevent="save">
      <div class="form-row">
        <label class="field">
          <span>类型</span>
          <select v-model="form.type">
            <option v-for="t in dicts.types" :key="t.id" :value="t.id">{{ t.name }}</option>
          </select>
        </label>
        <label class="field">
          <span>状态</span>
          <select v-model="form.status">
            <option v-for="s in STATUSES" :key="s" :value="s">{{ statusName(s) }}</option>
          </select>
        </label>
        <label class="field">
          <span>评分</span>
          <select v-model="form.rating">
            <option v-for="r in RATING_OPTIONS" :key="r.id" :value="r.id">{{ r.name }}</option>
          </select>
        </label>
      </div>
      <div class="form-row">
        <label class="field">
          <span>名称</span>
          <input v-model="form.title" required data-testid="entry-title" />
          <small v-if="fieldErrors.title" class="error">{{ fieldErrors.title }}</small>
        </label>
        <label class="field">
          <span>标识</span>
          <input v-model="form.slug" placeholder="留空则按名称生成" />
          <span class="hint">导出时的文件名：类型/标识.md</span>
        </label>
      </div>
      <label class="field">
        <span>一句话说明</span>
        <input v-model="form.summary" placeholder="它解决什么问题" />
      </label>
      <fieldset class="field">
        <legend>适用平台</legend>
        <div class="checks">
          <label v-for="p in dicts.platforms" :key="p.id">
            <input v-model="form.platforms" type="checkbox" :value="p.id" />{{ p.name }}
          </label>
        </div>
      </fieldset>
      <label class="field">
        <span>标签</span>
        <input v-model="form.tags" placeholder="用逗号分隔" />
      </label>
      <fieldset class="field">
        <legend>所属环境</legend>
        <div class="checks">
          <label v-for="s in stacksStore.stacks" :key="s.id">
            <input v-model="form.stacks" type="checkbox" :value="s.id" />{{ s.name }}
          </label>
        </div>
      </fieldset>
      <label class="field">
        <span>要点</span>
        <textarea v-model="form.fields" class="code" :placeholder="fieldHint"></textarea>
        <span class="hint">每行一项，格式“名称: 内容”。密钥不要写在这里，只写环境变量名。</span>
        <small v-if="fieldErrors.fields" class="error">{{ fieldErrors.fields }}</small>
      </label>
      <div class="field">
        <span>片段</span>
        <div class="snips">
          <div v-for="(s, i) in snippets" :key="i" class="snip-edit">
            <div class="form-row">
              <input
                v-model="s.label"
                placeholder="片段标题，如：安装（Claude Code）"
                aria-label="片段标题"
              />
              <input v-model="s.lang" placeholder="语言" aria-label="语言" />
              <label class="checks"> <input v-model="s.install" type="checkbox" />安装命令 </label>
              <div class="snip-ops">
                <button
                  class="btn btn-sm"
                  type="button"
                  @click="moveSnippet(i, -1)"
                  aria-label="上移"
                >
                  ↑
                </button>
                <button
                  class="btn btn-sm"
                  type="button"
                  @click="moveSnippet(i, 1)"
                  aria-label="下移"
                >
                  ↓
                </button>
                <button class="btn btn-sm btn-danger" type="button" @click="removeSnippet(i)">
                  移除
                </button>
              </div>
            </div>
            <textarea
              v-model="s.code"
              class="code"
              placeholder="命令、配置或提示词。提示词里用 {{变量}} 标出每次要替换的部分"
              aria-label="片段内容"
            ></textarea>
          </div>
        </div>
        <button class="btn btn-sm" type="button" @click="addSnippet">＋ 添加片段</button>
      </div>
      <label class="field">
        <span>链接</span>
        <textarea v-model="links" class="code" placeholder="官方文档 | https://"></textarea>
        <span class="hint">每行一个，格式“标题 | 地址”</span>
      </label>
      <label class="field">
        <span>笔记（支持 Markdown）</span>
        <textarea v-model="form.body" rows="8"></textarea>
      </label>
      <div class="checks">
        <label><input v-model="form.pinned" type="checkbox" />置顶到工作台</label>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" type="submit" data-testid="save-button">
          {{ isEdit ? '保存' : '新建' }}
        </button>
        <router-link
          class="btn"
          :to="isEdit && editing ? `/list/all/${editing.id}` : '/'"
          @click="!confirmLeave() && $event.preventDefault()"
          >取消</router-link
        >
        <button
          v-if="isEdit"
          class="btn btn-danger"
          type="button"
          data-testid="delete-button"
          @click="remove"
        >
          删除
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.form {
  display: grid;
  gap: 16px;
  max-width: 760px;
}
.form-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}
.field {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0;
  border: 0;
}
.field > span {
  font-size: 12px;
  color: var(--muted);
}
.field input,
.field select,
.field textarea {
  width: 100%;
  padding: 7px 10px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
}
.field textarea {
  min-height: 84px;
  resize: vertical;
  line-height: 1.55;
}
.field textarea.code {
  font-family: var(--font-mono);
  font-size: 12.5px;
  min-height: 110px;
}
.field .hint {
  font-size: 12px;
  color: var(--muted);
}
.checks {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
}
.checks label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.checks input[type='checkbox'] {
  width: auto;
  margin: 0;
}
.snips {
  display: grid;
  gap: 10px;
  margin-bottom: 8px;
}
.snip-edit {
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 1px dashed var(--line);
  border-radius: var(--r-md);
}
.snip-edit .form-row {
  grid-template-columns: 2fr 1fr auto auto;
  align-items: center;
}
.snip-ops {
  display: flex;
  gap: 4px;
}
.form-actions {
  display: flex;
  gap: 8px;
  padding-top: 8px;
}
.form-actions .btn-danger {
  margin-left: auto;
}
.error {
  color: var(--danger);
  font-size: 12px;
}
@media (max-width: 860px) {
  .snip-edit .form-row {
    grid-template-columns: 1fr 1fr;
  }
  .field input,
  .field select,
  .field textarea {
    font-size: 16px;
  }
}
</style>
