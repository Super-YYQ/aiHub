// Drizzle 表定义：列名 snake_case，JSON 用 camelCase，转换只在 worker/db 层做。
import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const types = sqliteTable('types', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  color: text('color').notNull(),
  fieldTemplate: text('field_template').notNull().default('[]'),
  sort: integer('sort').notNull().default(0),
  builtin: integer('builtin').notNull().default(0),
  updatedAt: text('updated_at').notNull(),
});

export const platforms = sqliteTable('platforms', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  sort: integer('sort').notNull().default(0),
  builtin: integer('builtin').notNull().default(0),
  updatedAt: text('updated_at').notNull(),
});

export const entries = sqliteTable(
  'entries',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    summary: text('summary').notNull().default(''),
    status: text('status').notNull().default('inbox'),
    pinned: integer('pinned').notNull().default(0),
    rating: integer('rating').notNull().default(0),
    platforms: text('platforms').notNull().default('[]'),
    tags: text('tags').notNull().default('[]'),
    fields: text('fields').notNull().default('{}'),
    snippets: text('snippets').notNull().default('[]'),
    links: text('links').notNull().default('[]'),
    body: text('body').notNull().default(''),
    version: integer('version').notNull().default(1),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    deletedAt: text('deleted_at'),
  },
  (t) => [
    uniqueIndex('uq_entries_type_slug').on(t.type, t.slug),
    index('idx_entries_updated').on(t.updatedAt),
  ],
);

export const stacks = sqliteTable(
  'stacks',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    kind: text('kind').notNull(),
    os: text('os').notNull(),
    description: text('description').notNull().default(''),
    sort: integer('sort').notNull().default(0),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    deletedAt: text('deleted_at'),
  },
  (t) => [uniqueIndex('uq_stacks_name').on(t.name)],
);

export const stackEntries = sqliteTable(
  'stack_entries',
  {
    stackId: text('stack_id').notNull(),
    entryId: text('entry_id').notNull(),
    note: text('note').notNull().default(''),
    addedAt: text('added_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.stackId, t.entryId] }),
    index('idx_stack_entries_entry').on(t.entryId),
  ],
);

export const revisions = sqliteTable(
  'revisions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    entryId: text('entry_id').notNull(),
    version: integer('version').notNull(),
    snapshot: text('snapshot').notNull(),
    actor: text('actor').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('idx_revisions_entry').on(t.entryId, t.version)],
);

export const changeLog = sqliteTable('change_log', {
  seq: integer('seq').primaryKey({ autoIncrement: true }),
  entity: text('entity').notNull(),
  entityId: text('entity_id').notNull(),
  op: text('op').notNull(),
  at: text('at').notNull(),
});

export const proposals = sqliteTable(
  'proposals',
  {
    id: text('id').primaryKey(),
    source: text('source').notNull(),
    actor: text('actor').notNull(),
    kind: text('kind').notNull(),
    targetEntryId: text('target_entry_id'),
    baseVersion: integer('base_version'),
    payload: text('payload').notNull(),
    reason: text('reason').notNull().default(''),
    status: text('status').notNull().default('pending'),
    createdAt: text('created_at').notNull(),
    decidedAt: text('decided_at'),
    decidedBy: text('decided_by'),
  },
  (t) => [index('idx_proposals_status').on(t.status, t.createdAt)],
);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const idempotency = sqliteTable('idempotency', {
  key: text('key').primaryKey(),
  response: text('response').notNull(),
  createdAt: text('created_at').notNull(),
});
