// MCP 端点（07-mcp-scanner.md#mcp-端点）：
// Streamable HTTP、无状态；鉴权走 Access 服务令牌（agent 角色），路由守卫在 app.ts。
// 工具只调用服务层，与 REST 共享校验与权限；输出控制大小（笔记截断、列表最多 50）。
import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { serializeEntry, buildChecklist, type Entry } from '@aikit/shared';
import { listEntries, getEntry } from '../services/entries';
import { listStacks, stackMembers } from '../services/stacks';
import { getRules } from '../services/settings';
import { createProposal } from '../services/proposals';
import { capture } from '../services/capture';
import { rowToType } from '../db/mappers';
import { COLLECTION_RULES } from './collection-rules';

const BUILTIN_TYPE_NAME: Record<string, string> = {
  tool: '工具',
  prompt: '提示词',
  skill: 'Skill',
  mcp: 'MCP',
  hook: 'Hook',
  plugin: '插件',
  config: '配置',
  model: '模型与 API',
};

export interface McpContext {
  db: D1Database;
  actor: string;
}

/** 构建一个 MCP 服务器实例（每次请求新建；无状态，全部数据来自服务层）。 */
export function createMcpServer(ctx: McpContext): McpServer {
  const server = new McpServer({ name: 'ai-kit', version: '1.0.0' });

  // ---------- 工具（07-mcp-scanner 工具表）----------
  server.registerTool(
    'search_entries',
    {
      title: '搜索条目',
      description:
        '按关键词搜索档案条目；返回摘要列表（id、type、slug、title、summary、status、tags、platforms、stacks）。',
      inputSchema: z.object({
        query: z.string().describe('按空白切分的关键词，每个都要命中'),
        type: z.string().optional().describe('只看这个类型 ID'),
        status: z
          .string()
          .optional()
          .describe('只看这个状态（inbox/using/trying/wishlist/archived）'),
        stack: z.string().optional().describe('只看这个环境 ID'),
        limit: z.number().int().min(1).max(50).optional().describe('返回条数，默认 20、最多 50'),
      }),
    },
    async ({ query, type, status, stack, limit }) => {
      const entries = await listEntries(ctx.db, { type, status, stack, q: query }, 50);
      const out = entries.slice(0, limit ?? 20);
      if (!out.length) return { content: [{ type: 'text', text: `没有找到“${query}”。` }] };
      const lines = out.map((e) => {
        const t = BUILTIN_TYPE_NAME[e.type] ?? e.type;
        return [
          `- ${t}/${e.slug}（${e.title}）id=${e.id}`,
          `  状态=${e.status}${e.pinned ? '，置顶' : ''}，标签=[${e.tags.join('、')}]，平台=[${e.platforms.join('、')}]`,
          e.summary ? `  ${e.summary}` : '',
          e.stacks.length ? `  环境=[${e.stacks.map((s) => s.id).join('、')}]` : '',
        ]
          .filter(Boolean)
          .join('\n');
      });
      return { content: [{ type: 'text', text: `找到 ${out.length} 条：\n${lines.join('\n')}` }] };
    },
  );

  server.registerTool(
    'get_entry',
    {
      title: '读取条目',
      description:
        '按 id 或 类型+slug 读取一个条目：返回与导出格式相同的 Markdown 和 id、version。',
      inputSchema: z.object({
        id: z.string().optional().describe('条目 ID'),
        type: z.string().optional().describe('类型 ID（与 slug 一起用）'),
        slug: z.string().optional().describe('标识（与 type 一起用）'),
      }),
    },
    async ({ id, type, slug }) => {
      let entry: Entry | null = null;
      if (id) entry = await getEntry(ctx.db, id);
      else if (type && slug) {
        const row = await ctx.db
          .prepare(`SELECT id FROM entries WHERE type = ? AND slug = ? AND deleted_at IS NULL`)
          .bind(type, slug)
          .first<{ id: string }>();
        if (row) entry = await getEntry(ctx.db, row.id);
      }
      if (!entry)
        return { content: [{ type: 'text', text: '找不到这个条目。用 search_entries 先查 id。' }] };
      const stackNames = new Map((await listStacks(ctx.db)).map((s) => [s.id, s.name]));
      const md = serializeEntry(entry, {
        stackName: (sid) => stackNames.get(sid) ?? sid,
      });
      return {
        content: [{ type: 'text', text: `id=${entry.id} version=${entry.version}\n\n${md}` }],
      };
    },
  );

  server.registerTool(
    'list_stacks',
    { title: '列出环境', description: '返回全部环境（id、name、kind、os、entryCount）。' },
    async () => {
      const stacks = await listStacks(ctx.db);
      const text = stacks.length
        ? stacks
            .map((s) => `- ${s.name}（id=${s.id}，${s.kind}/${s.os}，${s.entryCount} 个条目）`)
            .join('\n')
        : '还没有环境。';
      return { content: [{ type: 'text', text }] };
    },
  );

  server.registerTool(
    'get_stack_checklist',
    {
      title: '读取安装清单',
      description: '按环境 ID 或名称读取安装清单 Markdown（按类型分组，附安装命令片段）。',
      inputSchema: z.object({ stack: z.string().describe('环境 ID 或名称') }),
    },
    async ({ stack }) => {
      const stacks = await listStacks(ctx.db);
      const found = stacks.find((s) => s.id === stack || s.name === stack);
      if (!found)
        return {
          content: [{ type: 'text', text: `找不到环境“${stack}”。用 list_stacks 查名称。` }],
        };
      const { entries } = await stackMembers(ctx.db, found.id);
      const { results } = await ctx.db.prepare('SELECT * FROM types').all();
      const types = results.map((r) => rowToType(r as never));
      const order = Object.fromEntries(types.map((t) => [t.id, t.sort]));
      const names: Record<string, string> = Object.fromEntries(types.map((t) => [t.id, t.name]));
      const md = buildChecklist(found.name, entries, {
        typeName: (id) => names[id] ?? BUILTIN_TYPE_NAME[id] ?? id,
        typeOrder: order,
      });
      return { content: [{ type: 'text', text: md }] };
    },
  );

  server.registerTool(
    'capture',
    {
      title: '快速记录',
      description: '把看到的新工具随手记下，生成一条“待整理”条目；返回新条目的 id、title。',
      inputSchema: z.object({
        type: z.string().describe('类型 ID'),
        text: z.string().describe('内容（名字、链接或提示词）'),
        sourceUrl: z.string().optional().describe('可选来源链接'),
      }),
    },
    async ({ type, text, sourceUrl }) => {
      const entry = await capture(ctx.db, { type, text, sourceUrl });
      return {
        content: [{ type: 'text', text: `已存入待整理：id=${entry.id}，title=${entry.title}` }],
      };
    },
  );

  server.registerTool(
    'list_inbox',
    {
      title: '列出待整理',
      description: '返回待整理条目摘要和待确认提案的数量。',
      inputSchema: z.object({
        limit: z.number().int().min(1).max(50).optional().describe('返回条数，默认 20、最多 50'),
      }),
    },
    async ({ limit }) => {
      const entries = await listEntries(ctx.db, { status: 'inbox' }, 50);
      const out = entries.slice(0, limit ?? 20);
      const pendingRow = await ctx.db
        .prepare(`SELECT COUNT(*) AS n FROM proposals WHERE status = 'pending'`)
        .first<{ n: number }>();
      const lines = out.map(
        (e) => `- ${e.type}/${e.slug}（${e.title}）id=${e.id}${e.summary ? `：${e.summary}` : ''}`,
      );
      return {
        content: [
          {
            type: 'text',
            text: `待整理 ${entries.length} 条（显示 ${out.length}）：\n${lines.join('\n') || '（空）'}\n待确认提案：${pendingRow?.n ?? 0} 条`,
          },
        ],
      };
    },
  );

  server.registerTool(
    'propose_change',
    {
      title: '提交提案',
      description:
        '提出对档案的改动（新建/修改/弃用/合并），用户确认后才生效。草稿校验失败会返回具体原因，可据此修正后重试。',
      inputSchema: z.object({
        kind: z.enum(['create', 'update', 'archive', 'merge']).describe('提案类型'),
        targetId: z.string().optional().describe('目标条目 ID（update/archive/merge 必填）'),
        draft: z
          .record(z.string(), z.unknown())
          .optional()
          .describe('完整条目草稿（create/update/archive 必填）'),
        mergeIds: z.array(z.string()).optional().describe('合并时被并入的条目 ID 列表'),
        reason: z.string().max(1000).optional().describe('理由：来自哪个文件、网页或对话'),
      }),
    },
    async ({ kind, targetId, draft, mergeIds, reason }, extra) => {
      // MCP 上角色固定为 agent；ctx.actor 来自鉴权
      void extra;
      try {
        const payload: Record<string, unknown> = { kind, reason: reason ?? '' };
        if (targetId) payload.targetId = targetId;
        if (draft) payload.draft = draft;
        if (mergeIds) payload.mergeIds = mergeIds;
        if (kind === 'update' || kind === 'archive') {
          const target = await getEntry(ctx.db, targetId ?? '');
          if (target) payload.baseVersion = target.version;
        }
        const created = (await createProposal(ctx.db, payload, ctx.actor)) as { id: string };
        return {
          content: [
            {
              type: 'text',
              text: `提案已提交：id=${created.id}，状态 pending。到“待确认”页由用户接受。`,
            },
          ],
        };
      } catch (err) {
        const e = err as {
          status?: number;
          message?: string;
          details?: Array<Record<string, unknown>>;
          code?: string;
        };
        const detail =
          e.details && e.details.length ? `\n具体原因：${JSON.stringify(e.details, null, 1)}` : '';
        return {
          content: [
            {
              type: 'text',
              text: `提案被拒绝：${e.message ?? '未知错误'}${detail}\n请修正后重试。`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    'get_rules',
    { title: '读取整理规则', description: '返回 AI 整理档案时遵循的整理规则 Markdown。' },
    async () => {
      const rules = await getRules(ctx.db);
      return { content: [{ type: 'text', text: rules || '（整理规则还没有设置）' }] };
    },
  );

  server.registerTool(
    'get_collection_rules',
    {
      title: '读取数据收集规则说明',
      description:
        '返回数据收集规则说明 Markdown：读取本机配置的白名单、脱敏步骤、整理成提案的要求。',
    },
    async () => ({ content: [{ type: 'text', text: COLLECTION_RULES }] }),
  );

  // ---------- 资源 ----------
  server.registerResource(
    'rules',
    'aikit://rules',
    { description: '整理规则（AI 整理档案时遵循）', mimeType: 'text/markdown' },
    async () => ({
      contents: [{ uri: 'aikit://rules', mimeType: 'text/markdown', text: await getRules(ctx.db) }],
    }),
  );
  server.registerResource(
    'collection-rules',
    'aikit://collection-rules',
    { description: '数据收集规则说明（白名单、脱敏、整理成提案）', mimeType: 'text/markdown' },
    async () => ({
      contents: [
        { uri: 'aikit://collection-rules', mimeType: 'text/markdown', text: COLLECTION_RULES },
      ],
    }),
  );
  server.registerResource(
    'entry',
    'aikit://entries/{type}/{slug}',
    { description: '单个条目的 Markdown（按类型/标识）', mimeType: 'text/markdown' },
    async (uri: URL) => {
      const m = uri.href.match(/^aikit:\/\/entries\/([^/]+)\/(.+)$/);
      if (!m) return { contents: [] };
      const [, type, slug] = m;
      const row = await ctx.db
        .prepare(`SELECT id FROM entries WHERE type = ? AND slug = ? AND deleted_at IS NULL`)
        .bind(type, decodeURIComponent(slug))
        .first<{ id: string }>();
      if (!row) return { contents: [] };
      const entry = await getEntry(ctx.db, row.id);
      if (!entry) return { contents: [] };
      return {
        contents: [{ uri: uri.href, mimeType: 'text/markdown', text: serializeEntry(entry) }],
      };
    },
  );

  // ---------- 提示词 ----------
  server.registerPrompt(
    'collect_config',
    {
      title: '收集这台机器的配置',
      description:
        '读取数据收集规则说明，按规则读取白名单文件，逐项脱敏后用 propose_change 提交，最后汇总。',
      argsSchema: z.object({ stack: z.string().optional().describe('要归入的环境名称（可选）') }),
    },
    async ({ stack }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `请把这台机器的 AI 配置收进档案：
1. 先调用 get_collection_rules 读取数据收集规则说明，严格按其中的白名单读取文件，不打开白名单以外的位置。
2. 按说明的脱敏规则逐项脱敏（密钥一律写成 \${变量名} 或 \${REDACTED:<规则 ID>}）。
3. 先用 search_entries 查重，再逐项整理成条目草稿，用 propose_change 提交（reason 写清来自哪个文件）。
4. 把要写入的内容先列给我看，说明脱敏了多少处。
5. 最后汇总：提交了哪些提案、分别基于哪些文件。${stack ? `\n需要归到环境“${stack}”的，在提案理由里说明。` : ''}`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'organize_inbox',
    {
      title: '整理待整理',
      description: '按整理规则逐条处理待整理条目，补全后用 propose_change 提交，最后汇总。',
    },
    async () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `请整理档案里的待整理条目：
1. 先调用 get_rules 读取整理规则，再调用 list_inbox 看有哪些待整理。
2. 逐条处理：需要更多信息就查文件或网页；按整理规则补全说明、打标签、定状态。
3. 每条用 propose_change 提交修改提案（reason 写清依据）。
4. 最后汇总：提交了哪些提案、各自补全了什么。`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'setup_machine',
    {
      title: '按环境装机器',
      description: '读取安装清单，列出安装计划，每执行一条命令前先征得用户同意。',
      argsSchema: z.object({ stack: z.string().describe('环境 ID 或名称') }),
    },
    async ({ stack }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `请按档案里的环境“${stack}”准备这台机器：
1. 调用 get_stack_checklist 读取安装清单。
2. 列出安装计划（按清单分组）。
3. 每执行一条命令前把命令展示给我，征得我同意后再执行。
4. 全部完成后汇报结果和跳过的项目。`,
          },
        },
      ],
    }),
  );

  return server;
}
