// 全部实体的 Zod schema 与类型，按 docs/detailed/02-data-model.md 实现。
// JSON 用 camelCase；schema 前后端共用，服务端校验为准。
import { z } from 'zod';
import { STATUSES, STACK_KINDS, STACK_OS } from './dictionaries.js';
import { isUlid, isValidSlug } from './ids.js';

// ---------- 基础片段 ----------
export const TYPE_ID_RE = /^[a-z][a-z0-9-]{1,23}$/;
export const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const ulidSchema = z.string().refine(isUlid, '需要合法的 ULID');
const slugSchema = z
  .string()
  .refine((v) => isValidSlug(v), '标识 1–64 字符，只含小写字母、数字、汉字和 -，不以 - 开头或结尾');
const typeIdSchema = z.string().regex(TYPE_ID_RE, '类型 ID 需匹配 ^[a-z][a-z0-9-]{1,23}$');
const isoDate = z.string().datetime({ message: '需要 ISO 8601 时间字符串' });

export const httpUrlSchema = z
  .string()
  .max(2000, '链接最多 2000 字符')
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  }, '只允许 http/https 链接');

export const statusSchema = z.enum(STATUSES);
export const stackKindSchema = z.enum(STACK_KINDS);
export const stackOsSchema = z.enum(STACK_OS);

// 标签：去空白、去空项、不区分大小写去重，随后校验每个 1–32、总数 ≤ 20。
const singleTag = z.string().trim().min(1, '标签不能为空').max(32, '标签最多 32 字符');
export const tagsSchema = z
  .array(z.string())
  .transform((arr) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of arr) {
      const t = raw.trim();
      if (!t) continue;
      const key = t.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(t);
    }
    return out;
  })
  .pipe(z.array(singleTag).max(20, '最多 20 个标签'));

export const platformsSchema = z.array(z.string()).max(10, '最多 10 个平台');

export const fieldsSchema = z.record(z.string(), z.string()).superRefine((obj, ctx) => {
  const keys = Object.keys(obj);
  if (keys.length > 30) ctx.addIssue({ code: 'custom', message: '要点最多 30 项' });
  for (const k of keys) {
    if (k.length < 1 || k.length > 32)
      ctx.addIssue({ code: 'custom', message: `要点键“${k}”需 1–32 字符`, path: [k] });
    const v = obj[k];
    if (v.length < 1 || v.length > 500)
      ctx.addIssue({ code: 'custom', message: `要点“${k}”的值需 1–500 字符`, path: [k] });
  }
});

// ---------- 片段、链接、环境引用 ----------
export const snippetSchema = z.object({
  id: z.string().min(1).max(16).optional(),
  label: z.string().max(60, '片段标题最多 60 字符').default(''),
  lang: z.string().max(20, '语言最多 20 字符').default('text'),
  code: z.string().min(1, '片段内容不能为空').max(20000, '片段最多 20000 字符'),
  install: z.boolean().default(false),
});

/** 存储态片段：id 必填（条目内唯一，用于稳定引用）。 */
export const storedSnippetSchema = snippetSchema.extend({ id: z.string().min(1).max(16) });

export const linkSchema = z.object({
  label: z.string().max(60, '链接标题最多 60 字符').default(''),
  url: httpUrlSchema,
});

export const stackRefSchema = z.object({
  id: ulidSchema,
  note: z.string().max(280, '备注最多 280 字符').default(''),
});

// ---------- 条目 ----------
/** 写入草稿（新建、修改、提案 payload）：不含 version 与时间戳；id/slug 可省。 */
export const entryDraftSchema = z.object({
  id: ulidSchema.optional(),
  type: typeIdSchema,
  slug: slugSchema.optional(),
  title: z.string().min(1, '名称不能为空').max(120, '名称最多 120 字符'),
  summary: z.string().max(280, '说明最多 280 字符').default(''),
  status: statusSchema.default('inbox'),
  pinned: z.boolean().default(false),
  rating: z.number().int().min(0).max(5).default(0),
  platforms: platformsSchema.default([]),
  tags: tagsSchema.default([]),
  fields: fieldsSchema.default({}),
  snippets: z.array(snippetSchema).max(20, '最多 20 个片段').default([]),
  links: z.array(linkSchema).max(20, '最多 20 个链接').default([]),
  body: z.string().max(50000, '笔记最多 50000 字符').default(''),
  stacks: z.array(stackRefSchema).optional(),
});

/** 完整条目（存储、返回、导出）。 */
export const entrySchema = z.object({
  id: ulidSchema,
  type: typeIdSchema,
  slug: slugSchema,
  title: z.string().min(1).max(120),
  summary: z.string().max(280),
  status: statusSchema,
  pinned: z.boolean(),
  rating: z.number().int().min(0).max(5),
  platforms: platformsSchema,
  tags: tagsSchema,
  fields: fieldsSchema,
  snippets: z.array(storedSnippetSchema).max(20),
  links: z.array(linkSchema).max(20),
  body: z.string().max(50000),
  stacks: z.array(stackRefSchema).default([]),
  version: z.number().int().min(1),
  createdAt: isoDate,
  updatedAt: isoDate,
  deletedAt: isoDate.nullable().default(null),
});

/** 快捷操作：只改 status / pinned / rating。 */
export const entryPatchSchema = z
  .object({
    status: statusSchema.optional(),
    pinned: z.boolean().optional(),
    rating: z.number().int().min(0).max(5).optional(),
  })
  .refine((o) => o.status !== undefined || o.pinned !== undefined || o.rating !== undefined, {
    message: '至少修改 status、pinned 或 rating 之一',
  });

// ---------- 快速记录 ----------
export const captureSchema = z.object({
  type: typeIdSchema,
  text: z.string().min(1, '内容不能为空').max(50000, '内容过长'),
  sourceUrl: httpUrlSchema.optional(),
  stackId: ulidSchema.optional(),
});

// ---------- 类型、平台字典 ----------
export const typeWriteSchema = z.object({
  name: z.string().min(1, '名称不能为空').max(20, '名称最多 20 字符'),
  color: z.string().regex(COLOR_RE, '颜色需为 #RRGGBB'),
  fieldTemplate: z.array(z.string().min(1).max(32)).max(20, '字段模板最多 20 项').default([]),
  sort: z.number().int().default(0),
});
export const typeSchema = typeWriteSchema.extend({
  id: typeIdSchema,
  builtin: z.boolean().default(false),
  updatedAt: isoDate.optional(),
});

export const platformWriteSchema = z.object({
  name: z.string().min(1, '名称不能为空').max(20, '名称最多 20 字符'),
  sort: z.number().int().default(0),
});
export const platformSchema = platformWriteSchema.extend({
  id: typeIdSchema,
  builtin: z.boolean().default(false),
  updatedAt: isoDate.optional(),
});

// ---------- 环境 ----------
export const stackWriteSchema = z.object({
  name: z.string().min(1, '名称不能为空').max(40, '名称最多 40 字符'),
  kind: stackKindSchema,
  os: stackOsSchema,
  description: z.string().max(280, '说明最多 280 字符').default(''),
  sort: z.number().int().default(0),
});
export const stackSchema = stackWriteSchema.extend({
  id: ulidSchema,
  version: z.number().int().min(1).default(1),
  createdAt: isoDate,
  updatedAt: isoDate,
  deletedAt: isoDate.nullable().default(null),
});
export const stackEntriesUpdateSchema = z.object({
  add: z
    .array(z.object({ entryId: ulidSchema, note: z.string().max(280).default('') }))
    .default([]),
  remove: z.array(ulidSchema).default([]),
});
export const stackEntryNoteSchema = z.object({ note: z.string().max(280, '备注最多 280 字符') });

// ---------- 设置、标签、导入模式 ----------
export const settingsRulesSchema = z.object({
  value: z.string().max(20000, '整理规则最多 20000 字符'),
});
export const settingsSchema = z.object({ rules: z.string().max(20000) });
export const tagRenameSchema = z.object({
  from: z.string().trim().min(1, '原标签不能为空').max(32),
  to: z.string().trim().min(1, '新标签不能为空').max(32),
});
export const importModeSchema = z.enum(['replace', 'merge', 'prototype']);

// ---------- 提案 ----------
export const proposalKindSchema = z.enum(['create', 'update', 'archive', 'merge']);
export const proposalStatusSchema = z.enum(['pending', 'accepted', 'rejected', 'superseded']);

/** 代理提交提案（MCP / API）。 */
export const proposalCreateSchema = z
  .object({
    kind: proposalKindSchema,
    targetId: ulidSchema.optional(),
    baseVersion: z.number().int().min(1).optional(),
    draft: entryDraftSchema.optional(),
    mergeIds: z.array(ulidSchema).optional(),
    reason: z.string().max(1000, '理由最多 1000 字符').default(''),
  })
  .superRefine((o, ctx) => {
    if ((o.kind === 'create' || o.kind === 'update' || o.kind === 'archive') && !o.draft)
      ctx.addIssue({ code: 'custom', message: '需要 draft', path: ['draft'] });
    if ((o.kind === 'update' || o.kind === 'archive') && !o.targetId)
      ctx.addIssue({ code: 'custom', message: '需要 targetId', path: ['targetId'] });
    if (o.kind === 'merge' && (!o.mergeIds || o.mergeIds.length < 1))
      ctx.addIssue({ code: 'custom', message: '合并需要 mergeIds', path: ['mergeIds'] });
  });

export const proposalSchema = z.object({
  id: ulidSchema,
  source: z.literal('agent'),
  actor: z.string().max(120),
  kind: proposalKindSchema,
  targetEntryId: ulidSchema.nullable().default(null),
  baseVersion: z.number().int().nullable().default(null),
  payload: z.unknown(),
  reason: z.string().max(1000).default(''),
  status: proposalStatusSchema,
  createdAt: isoDate,
  decidedAt: isoDate.nullable().default(null),
  decidedBy: z.string().nullable().default(null),
});

// ---------- 导出 ----------
export const exportSchema = z.object({
  schemaVersion: z.number().int(),
  exportedAt: isoDate,
  types: z.array(typeSchema),
  platforms: z.array(platformSchema),
  stacks: z.array(stackSchema),
  entries: z.array(entrySchema),
  settings: settingsSchema,
});

// ---------- 推断类型 ----------
export type Snippet = z.infer<typeof snippetSchema>;
export type StoredSnippet = z.infer<typeof storedSnippetSchema>;
export type Link = z.infer<typeof linkSchema>;
export type StackRef = z.infer<typeof stackRefSchema>;
export type Entry = z.infer<typeof entrySchema>;
export type EntryDraft = z.infer<typeof entryDraftSchema>;
export type EntryDraftInput = z.input<typeof entryDraftSchema>;
export type EntryPatch = z.infer<typeof entryPatchSchema>;
export type CaptureRequest = z.infer<typeof captureSchema>;
export type TypeDict = z.infer<typeof typeSchema>;
export type TypeWrite = z.infer<typeof typeWriteSchema>;
export type PlatformDict = z.infer<typeof platformSchema>;
export type PlatformWrite = z.infer<typeof platformWriteSchema>;
export type Stack = z.infer<typeof stackSchema>;
export type StackWrite = z.infer<typeof stackWriteSchema>;
export type StackEntriesUpdate = z.infer<typeof stackEntriesUpdateSchema>;
export type Proposal = z.infer<typeof proposalSchema>;
export type ProposalCreate = z.infer<typeof proposalCreateSchema>;
export type ProposalKind = z.infer<typeof proposalKindSchema>;
export type ProposalStatus = z.infer<typeof proposalStatusSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type ExportData = z.infer<typeof exportSchema>;
export type ImportMode = z.infer<typeof importModeSchema>;
export type TagRename = z.infer<typeof tagRenameSchema>;
