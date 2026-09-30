// 测试用种子数据导入：直接经 SQL 写入本地测试库（幂等）。
import { env } from 'cloudflare:test';
import seedJson from '../seed/seed.json';

function lit(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

let done = false;
export async function seedForTests(): Promise<void> {
  if (done) return;
  const seed = seedJson as {
    stacks: Array<Record<string, unknown>>;
    entries: Array<Record<string, unknown>>;
  };
  const now = new Date().toISOString();
  const stmts: string[] = [];
  for (const s of seed.stacks) {
    stmts.push(
      `INSERT INTO stacks (id, name, kind, os, description, sort, version, created_at, updated_at, deleted_at)
       SELECT ${lit(s.id)}, ${lit(s.name)}, ${lit(s.kind)}, ${lit(s.os)}, ${lit(s.description ?? '')}, ${lit(s.sort ?? 0)}, 1, ${lit(now)}, ${lit(now)}, NULL
       WHERE NOT EXISTS (SELECT 1 FROM stacks WHERE id = ${lit(s.id)});`,
      `INSERT INTO change_log (entity, entity_id, op, at)
       SELECT 'stack', ${lit(s.id)}, 'upsert', ${lit(now)}
       WHERE NOT EXISTS (SELECT 1 FROM change_log WHERE entity = 'stack' AND entity_id = ${lit(s.id)});`,
    );
  }
  for (const e of seed.entries) {
    stmts.push(
      `INSERT INTO entries (id, type, slug, title, summary, status, pinned, rating, platforms, tags, fields, snippets, links, body, version, created_at, updated_at, deleted_at)
       SELECT ${lit(e.id)}, ${lit(e.type)}, ${lit(e.slug)}, ${lit(e.title)}, ${lit(e.summary ?? '')}, ${lit(e.status ?? 'inbox')}, ${lit(e.pinned ?? false)}, ${lit(e.rating ?? 0)},
              ${lit(e.platforms ?? [])}, ${lit(e.tags ?? [])}, ${lit(e.fields ?? {})}, ${lit(e.snippets ?? [])}, ${lit(e.links ?? [])}, ${lit(e.body ?? '')},
              1, ${lit((e.createdAt as string) ?? now)}, ${lit((e.updatedAt as string) ?? now)}, NULL
       WHERE NOT EXISTS (SELECT 1 FROM entries WHERE id = ${lit(e.id)});`,
      `INSERT INTO change_log (entity, entity_id, op, at)
       SELECT 'entry', ${lit(e.id)}, 'upsert', ${lit(now)}
       WHERE NOT EXISTS (SELECT 1 FROM change_log WHERE entity = 'entry' AND entity_id = ${lit(e.id)});`,
    );
    for (const ref of (e.stacks as Array<{ id: string; note?: string }>) ?? []) {
      stmts.push(
        `INSERT INTO stack_entries (stack_id, entry_id, note, added_at)
         SELECT ${lit(ref.id)}, ${lit(e.id)}, ${lit(ref.note ?? '')}, ${lit(now)}
         WHERE NOT EXISTS (SELECT 1 FROM stack_entries WHERE stack_id = ${lit(ref.id)} AND entry_id = ${lit(e.id)});`,
      );
    }
  }
  await env.DB.batch(stmts.map((sql) => env.DB.prepare(sql)));
  done = true;
}
