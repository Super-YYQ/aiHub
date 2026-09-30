// 导出与导入（02-data-model#导出格式、#导入）。
import {
  convertPrototype,
  scanEntry,
  slugify,
  ulid,
  snippetId,
  exportSchema,
  entryDraftSchema,
  stackWriteSchema,
  isUlid,
  type ExportData,
  type Entry,
  type Stack,
} from '@aikit/shared';
import {
  rowToEntry,
  rowToStack,
  rowToType,
  rowToPlatform,
  type EntryRow,
  type StackRow,
  type TypeRow,
  type PlatformRow,
} from '../db/mappers';
import { changeLogStmt, loadStackRefs } from '../db/helpers';
import { badRequest, validationFailed, secretDetected as secretDetectedError } from '../errors';

/** 导出全部数据（02 导出格式）。 */
export async function exportAll(db: D1Database): Promise<ExportData> {
  const types = (
    await db.prepare(`SELECT * FROM types ORDER BY sort, id`).all<TypeRow>()
  ).results.map(rowToType);
  const platforms = (
    await db.prepare(`SELECT * FROM platforms ORDER BY sort, id`).all<PlatformRow>()
  ).results.map(rowToPlatform);
  const stacks = (
    await db
      .prepare(
        `SELECT id, name, kind, os, description, sort, version, created_at, updated_at, deleted_at FROM stacks WHERE deleted_at IS NULL ORDER BY sort, created_at`,
      )
      .all<StackRow>()
  ).results.map(rowToStack);
  const { results: entryRows } = await db
    .prepare(
      `SELECT id, type, slug, title, summary, status, pinned, rating, platforms, tags, fields,
              snippets, links, body, version, created_at, updated_at, deleted_at
       FROM entries WHERE deleted_at IS NULL`,
    )
    .all<EntryRow>();
  const refs = await loadStackRefs(
    db,
    entryRows.map((r) => r.id),
  );
  const entries = entryRows.map((r) => rowToEntry(r, refs.get(r.id) ?? []));
  const rules = await db
    .prepare(`SELECT value FROM settings WHERE key = 'rules'`)
    .first<{ value: string }>();

  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    types,
    platforms,
    stacks,
    entries,
    settings: { rules: rules?.value ?? '' },
  };
}

interface ImportFile {
  schemaVersion?: number;
  exportedAt?: string;
  types?: unknown[];
  platforms?: unknown[];
  stacks?: unknown[];
  entries?: unknown[];
  settings?: { rules?: string };
  // prototype 模式：原型导出的 { stacks, entries }
}

export interface ImportResult {
  imported: number;
  renamed: string[];
}

/** 归一化条目：补 id/slug/片段 id/时间/version，密钥扫描。 */
function normalizeEntry(raw: unknown, now: string): Entry {
  const draft = entryDraftSchema.parse(raw);
  const findings = scanEntry(draft);
  if (findings.length) throw secretDetectedError(findings);
  return {
    id: draft.id ?? ulid(),
    type: draft.type,
    slug: draft.slug ?? slugify(draft.title),
    title: draft.title,
    summary: draft.summary,
    status: draft.status,
    pinned: draft.pinned,
    rating: draft.rating,
    platforms: draft.platforms,
    tags: draft.tags,
    fields: draft.fields,
    snippets: draft.snippets.map((s) => ({ ...s, id: s.id ?? snippetId() })),
    links: draft.links,
    body: draft.body,
    stacks: draft.stacks ?? [],
    version: 1,
    createdAt: (raw as { createdAt?: string }).createdAt ?? now,
    updatedAt: (raw as { updatedAt?: string }).updatedAt ?? now,
    deletedAt: null,
  };
}

function normalizeStack(raw: unknown, now: string): Stack {
  const data = stackWriteSchema.parse(raw);
  return {
    id:
      (raw as { id?: string }).id && isUlid((raw as { id?: string }).id)
        ? (raw as { id: string }).id
        : ulid(),
    name: data.name,
    kind: data.kind,
    os: data.os,
    description: data.description,
    sort: data.sort,
    version: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

/** replace：清空条目/环境/成员后重建；字典按 ID 覆盖。 */
async function importReplace(db: D1Database, file: ImportFile): Promise<ImportResult> {
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`DELETE FROM stack_entries`),
    db.prepare(`DELETE FROM entries`),
    db.prepare(`DELETE FROM stacks`),
  ]);

  const renamed: string[] = [];
  for (const raw of file.types ?? []) {
    const t = raw as {
      id: string;
      name: string;
      color: string;
      fieldTemplate?: string[];
      sort?: number;
      builtin?: boolean;
      updatedAt?: string;
    };
    const at = t.updatedAt ?? now;
    await db
      .prepare(
        `INSERT INTO types (id, name, color, field_template, sort, builtin, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET name = excluded.name, color = excluded.color,
           field_template = excluded.field_template, sort = excluded.sort, updated_at = excluded.updated_at`,
      )
      .bind(
        t.id,
        t.name,
        t.color,
        JSON.stringify(t.fieldTemplate ?? []),
        t.sort ?? 0,
        t.builtin ? 1 : 0,
        at,
      )
      .run();
    await changeLogStmt(db, 'type', t.id, 'upsert', now).run();
  }
  for (const raw of file.platforms ?? []) {
    const pf = raw as {
      id: string;
      name: string;
      sort?: number;
      builtin?: boolean;
      updatedAt?: string;
    };
    const at = pf.updatedAt ?? now;
    await db
      .prepare(
        `INSERT INTO platforms (id, name, sort, builtin, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET name = excluded.name, sort = excluded.sort, updated_at = excluded.updated_at`,
      )
      .bind(pf.id, pf.name, pf.sort ?? 0, pf.builtin ? 1 : 0, at)
      .run();
    await changeLogStmt(db, 'platform', pf.id, 'upsert', now).run();
  }

  const stackIds = new Map<string, string>();
  for (const raw of file.stacks ?? []) {
    const stack = normalizeStack(raw, now);
    stackIds.set((raw as { id?: string }).id ?? stack.id, stack.id);
    const createdAt = (raw as { createdAt?: string }).createdAt ?? now;
    const updatedAt = (raw as { updatedAt?: string }).updatedAt ?? createdAt;
    await db
      .prepare(
        `INSERT INTO stacks (id, name, kind, os, description, sort, version, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      )
      .bind(
        stack.id,
        stack.name,
        stack.kind,
        stack.os,
        stack.description,
        stack.sort,
        (raw as { version?: number }).version ?? 1,
        createdAt,
        updatedAt,
      )
      .run();
    await changeLogStmt(db, 'stack', stack.id, 'upsert', now).run();
  }

  let imported = 0;
  for (const raw of file.entries ?? []) {
    const entry = normalizeEntry(raw, now);
    const version = (raw as { version?: number }).version ?? entry.version;
    await db
      .prepare(
        `INSERT INTO entries (id, type, slug, title, summary, status, pinned, rating, platforms, tags, fields, snippets, links, body, version, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      )
      .bind(
        entry.id,
        entry.type,
        entry.slug,
        entry.title,
        entry.summary,
        entry.status,
        entry.pinned ? 1 : 0,
        entry.rating,
        JSON.stringify(entry.platforms),
        JSON.stringify(entry.tags),
        JSON.stringify(entry.fields),
        JSON.stringify(entry.snippets),
        JSON.stringify(entry.links),
        entry.body,
        version,
        entry.createdAt,
        entry.updatedAt,
      )
      .run();
    await changeLogStmt(db, 'entry', entry.id, 'upsert', now).run();
    for (const ref of entry.stacks) {
      const mapped = stackIds.get(ref.id) ?? ref.id;
      await db
        .prepare(
          `INSERT OR IGNORE INTO stack_entries (stack_id, entry_id, note, added_at) VALUES (?, ?, ?, ?)`,
        )
        .bind(mapped, entry.id, ref.note ?? '', now)
        .run();
    }
    imported++;
  }

  if (file.settings?.rules != null) {
    await db
      .prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES ('rules', ?, ?)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .bind(
        file.settings.rules,
        (file as { settings?: { rules?: string; updatedAt?: string } }).settings?.updatedAt ?? now,
      )
      .run();
  }

  return { imported, renamed };
}

/** merge：按 id 更新或新建；同 (type, slug) 冲突加 -2、-3 后缀。 */
async function importMerge(
  db: D1Database,
  file: ImportFile,
  prototypeIds = false,
): Promise<ImportResult> {
  const now = new Date().toISOString();
  const renamed: string[] = [];
  let imported = 0;

  // prototype 模式：先转换（02-data-model#导入）
  let stacksRaw = file.stacks ?? [];
  let entriesRaw = file.entries ?? [];
  if (prototypeIds) {
    const converted = convertPrototype({
      stacks: stacksRaw as never[],
      entries: entriesRaw as never[],
    });
    stacksRaw = converted.stacks;
    entriesRaw = converted.entries;
  }

  // merge 模式：字典按 ID 覆盖（prototype 转换不带字典，跳过）
  if (!prototypeIds) {
    for (const raw of file.types ?? []) {
      const t = raw as {
        id: string;
        name: string;
        color: string;
        fieldTemplate?: string[];
        sort?: number;
        builtin?: boolean;
        updatedAt?: string;
      };
      const at = t.updatedAt ?? now;
      await db
        .prepare(
          `INSERT INTO types (id, name, color, field_template, sort, builtin, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET name = excluded.name, color = excluded.color,
             field_template = excluded.field_template, sort = excluded.sort, updated_at = excluded.updated_at`,
        )
        .bind(
          t.id,
          t.name,
          t.color,
          JSON.stringify(t.fieldTemplate ?? []),
          t.sort ?? 0,
          t.builtin ? 1 : 0,
          at,
        )
        .run();
      await changeLogStmt(db, 'type', t.id, 'upsert', now).run();
    }
    for (const raw of file.platforms ?? []) {
      const pf = raw as {
        id: string;
        name: string;
        sort?: number;
        builtin?: boolean;
        updatedAt?: string;
      };
      const at = pf.updatedAt ?? now;
      await db
        .prepare(
          `INSERT INTO platforms (id, name, sort, builtin, updated_at) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET name = excluded.name, sort = excluded.sort, updated_at = excluded.updated_at`,
        )
        .bind(pf.id, pf.name, pf.sort ?? 0, pf.builtin ? 1 : 0, at)
        .run();
      await changeLogStmt(db, 'platform', pf.id, 'upsert', now).run();
    }
  }

  const stackIds = new Map<string, string>();
  for (const raw of stacksRaw) {
    const data = stackWriteSchema.safeParse(raw);
    if (!data.success) continue;
    const oldId = (raw as { id?: string }).id;
    const withId = prototypeIds
      ? { ...(raw as object), id: undefined }
      : { ...(raw as object), id: oldId };
    const stack = normalizeStack(withId, now);
    // 同名环境：并入已有的
    const dup = await db
      .prepare(`SELECT id FROM stacks WHERE name = ? AND deleted_at IS NULL`)
      .bind(stack.name)
      .first<{ id: string }>();
    const targetId = dup?.id ?? stack.id;
    if (oldId) stackIds.set(oldId, targetId);
    if (!dup) {
      await db
        .prepare(
          `INSERT INTO stacks (id, name, kind, os, description, sort, version, created_at, updated_at, deleted_at)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, NULL)`,
        )
        .bind(stack.id, stack.name, stack.kind, stack.os, stack.description, stack.sort, now, now)
        .run();
      await changeLogStmt(db, 'stack', stack.id, 'upsert', now).run();
    }
  }

  for (const raw of entriesRaw) {
    const draft = entryDraftSchema.safeParse(raw);
    if (!draft.success) {
      throw validationFailed(
        '导入的条目没有通过校验。',
        draft.error.issues.map((i) => ({
          path: i.path.join('.'),
          issue: i.code,
          message: i.message,
        })),
      );
    }
    const findings = scanEntry(draft.data);
    if (findings.length) throw secretDetectedError(findings);

    const clientEntryId = prototypeIds ? undefined : draft.data.id; // prototype 模式一律重新生成 id
    let entryId = clientEntryId ?? ulid();

    // (type, slug) 冲突：加后缀
    let slug = draft.data.slug ?? slugify(draft.data.title);
    for (let n = 2; ; n++) {
      const taken = await db
        .prepare(`SELECT 1 FROM entries WHERE type = ? AND slug = ? AND deleted_at IS NULL`)
        .bind(draft.data.type, slug)
        .first();
      if (!taken) break;
      renamed.push(`${draft.data.type}/${slug}`);
      slug = `${draft.data.slug ?? slugify(draft.data.title)}-${n}`;
    }

    const createdAt = (raw as { createdAt?: string }).createdAt ?? now;
    const updatedAt = (raw as { updatedAt?: string }).updatedAt ?? createdAt;
    await db
      .prepare(
        `INSERT INTO entries (id, type, slug, title, summary, status, pinned, rating, platforms, tags, fields, snippets, links, body, version, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL)`,
      )
      .bind(
        entryId,
        draft.data.type,
        slug,
        draft.data.title,
        draft.data.summary,
        draft.data.status,
        draft.data.pinned ? 1 : 0,
        draft.data.rating,
        JSON.stringify(draft.data.platforms),
        JSON.stringify(draft.data.tags),
        JSON.stringify(draft.data.fields),
        JSON.stringify(draft.data.snippets.map((s) => ({ ...s, id: s.id ?? snippetId() }))),
        JSON.stringify(draft.data.links),
        draft.data.body,
        createdAt,
        updatedAt,
      )
      .run();
    await changeLogStmt(db, 'entry', entryId, 'upsert', now).run();
    imported++;

    // 成员关系（prototype 模式：原 stacks 数组已由 convertPrototype 转成 {id, note}）
    const refs = (raw as { stacks?: Array<{ id: string; note?: string }> }).stacks ?? [];
    for (const ref of refs) {
      const mapped = stackIds.get(ref.id) ?? ref.id;
      await db
        .prepare(
          `INSERT OR IGNORE INTO stack_entries (stack_id, entry_id, note, added_at) VALUES (?, ?, ?, ?)`,
        )
        .bind(mapped, entryId, ref.note ?? '', now)
        .run();
    }
  }
  return { imported, renamed };
}

/** 导入三种模式（03-api POST /api/import?mode=）。 */
export async function importData(
  db: D1Database,
  mode: 'replace' | 'merge' | 'prototype',
  payload: unknown,
): Promise<ImportResult> {
  if (mode === 'prototype') {
    const shape = payload as { stacks?: unknown[]; entries?: unknown[] };
    if (!Array.isArray(shape.stacks) || !Array.isArray(shape.entries))
      throw badRequest('prototype 模式需要原型导出的 JSON（含 stacks 与 entries 数组）。');
    return importMerge(db, shape, true);
  }

  const parsed = exportSchema.safeParse(payload);
  if (!parsed.success)
    throw validationFailed(
      '导入文件不是本工具导出的 JSON。',
      parsed.error.issues.map((i) => ({
        path: i.path.join('.'),
        issue: i.code,
        message: i.message,
      })),
    );

  if (mode === 'replace') return importReplace(db, parsed.data);
  return importMerge(db, parsed.data);
}
