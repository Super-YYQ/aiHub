-- E2E 重置：清空业务表，恢复确定性的初始状态（只用于本地 wrangler dev 的库）。
DELETE FROM change_log;
DELETE FROM stack_entries;
DELETE FROM entries;
DELETE FROM stacks;
DELETE FROM idempotency;
DELETE FROM revisions;

-- 自定义字典也清掉（内置的保留），保证每次 E2E 运行的初始状态一致；
-- 不清的话旧的自定义类型还在表里、但日志行没了，同步看不到它们。
DELETE FROM types WHERE builtin = 0;
DELETE FROM platforms WHERE builtin = 0;

-- 内置字典与默认规则的变更日志：迁移只在首次应用时写入，重置后补回来，
-- 否则增量同步看不到 types/platforms，前端字典为空。
INSERT INTO change_log (entity, entity_id, op, at) VALUES
  ('type', 'tool', 'upsert', '2026-09-29T00:00:00.000Z'),
  ('type', 'prompt', 'upsert', '2026-09-29T00:00:00.000Z'),
  ('type', 'skill', 'upsert', '2026-09-29T00:00:00.000Z'),
  ('type', 'mcp', 'upsert', '2026-09-29T00:00:00.000Z'),
  ('type', 'hook', 'upsert', '2026-09-29T00:00:00.000Z'),
  ('type', 'plugin', 'upsert', '2026-09-29T00:00:00.000Z'),
  ('type', 'config', 'upsert', '2026-09-29T00:00:00.000Z'),
  ('type', 'model', 'upsert', '2026-09-29T00:00:00.000Z'),
  ('platform', 'claude-code', 'upsert', '2026-09-29T00:00:00.000Z'),
  ('platform', 'codex', 'upsert', '2026-09-29T00:00:00.000Z'),
  ('platform', 'cursor', 'upsert', '2026-09-29T00:00:00.000Z'),
  ('platform', 'claude-app', 'upsert', '2026-09-29T00:00:00.000Z'),
  ('platform', 'chatgpt', 'upsert', '2026-09-29T00:00:00.000Z'),
  ('platform', 'general', 'upsert', '2026-09-29T00:00:00.000Z'),
  ('setting', 'rules', 'upsert', '2026-09-29T00:00:00.000Z');
