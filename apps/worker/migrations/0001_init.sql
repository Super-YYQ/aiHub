-- 0001_init.sql — 初始表结构（见 docs/detailed/02-data-model.md#表结构）
-- 只做向后兼容的改动：加表、加可空列、加索引（见 01-architecture#构建与部署）。

CREATE TABLE types (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL,
  field_template TEXT NOT NULL DEFAULT '[]', sort INTEGER NOT NULL DEFAULT 0,
  builtin INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL
);
CREATE TABLE platforms (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0,
  builtin INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL
);
CREATE TABLE entries (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL REFERENCES types (id),
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'inbox',
  pinned INTEGER NOT NULL DEFAULT 0,
  rating INTEGER NOT NULL DEFAULT 0,
  platforms TEXT NOT NULL DEFAULT '[]',
  tags TEXT NOT NULL DEFAULT '[]',
  fields TEXT NOT NULL DEFAULT '{}',
  snippets TEXT NOT NULL DEFAULT '[]',
  links TEXT NOT NULL DEFAULT '[]',
  body TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE UNIQUE INDEX uq_entries_type_slug ON entries (type, slug) WHERE deleted_at IS NULL;
CREATE INDEX idx_entries_updated ON entries (updated_at);

CREATE TABLE stacks (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, os TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '', sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE UNIQUE INDEX uq_stacks_name ON stacks (name) WHERE deleted_at IS NULL;
CREATE TABLE stack_entries (
  stack_id TEXT NOT NULL REFERENCES stacks (id),
  entry_id TEXT NOT NULL REFERENCES entries (id),
  note TEXT NOT NULL DEFAULT '', added_at TEXT NOT NULL,
  PRIMARY KEY (stack_id, entry_id)
);
CREATE INDEX idx_stack_entries_entry ON stack_entries (entry_id);

CREATE TABLE revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id TEXT NOT NULL, version INTEGER NOT NULL,
  snapshot TEXT NOT NULL, actor TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX idx_revisions_entry ON revisions (entry_id, version);

CREATE TABLE change_log (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  entity TEXT NOT NULL,        -- entry | stack | type | platform | proposal | setting
  entity_id TEXT NOT NULL,
  op TEXT NOT NULL,            -- upsert | delete
  at TEXT NOT NULL
);

CREATE TABLE proposals (
  id TEXT PRIMARY KEY, source TEXT NOT NULL, actor TEXT NOT NULL, kind TEXT NOT NULL,
  target_entry_id TEXT, base_version INTEGER, payload TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL, decided_at TEXT, decided_by TEXT
);
CREATE INDEX idx_proposals_status ON proposals (status, created_at);

CREATE TABLE settings (
  key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE idempotency (
  key TEXT PRIMARY KEY, response TEXT NOT NULL, created_at TEXT NOT NULL
);

-- 内置类型（颜色取原型浅色 --t-* 变量；fieldTemplate 取原型 TYPES）
INSERT INTO types (id, name, color, field_template, sort, builtin, updated_at) VALUES
  ('tool',    '工具',      '#2f6db5', '["类别","安装方式","配置目录","费用"]',                     0, 1, '2026-09-29T00:00:00.000Z'),
  ('prompt',  '提示词',    '#8349bd', '["适用场景","推荐模型","变量"]',                           1, 1, '2026-09-29T00:00:00.000Z'),
  ('skill',   'Skill',     '#237f50', '["宿主","来自插件","触发"]',                               2, 1, '2026-09-29T00:00:00.000Z'),
  ('mcp',     'MCP',       '#c43d32', '["传输","命令","地址","作用域","需要的环境变量"]',          3, 1, '2026-09-29T00:00:00.000Z'),
  ('hook',    'Hook',      '#a36700', '["事件","匹配器","配置位置","依赖"]',                      4, 1, '2026-09-29T00:00:00.000Z'),
  ('plugin',  '插件',      '#0b7a87', '["市场","包含","来源仓库"]',                               5, 1, '2026-09-29T00:00:00.000Z'),
  ('config',  '配置',      '#56626f', '["文件路径","引用方式","生效范围"]',                       6, 1, '2026-09-29T00:00:00.000Z'),
  ('model',   '模型与 API','#ad3571', '["服务商","常用模型","密钥变量"]',                          7, 1, '2026-09-29T00:00:00.000Z');

-- 内置平台
INSERT INTO platforms (id, name, sort, builtin, updated_at) VALUES
  ('claude-code', 'Claude Code', 0, 1, '2026-09-29T00:00:00.000Z'),
  ('codex',       'Codex',       1, 1, '2026-09-29T00:00:00.000Z'),
  ('cursor',      'Cursor',      2, 1, '2026-09-29T00:00:00.000Z'),
  ('claude-app',  'Claude 客户端', 3, 1, '2026-09-29T00:00:00.000Z'),
  ('chatgpt',     'ChatGPT',     4, 1, '2026-09-29T00:00:00.000Z'),
  ('general',     '通用',        5, 1, '2026-09-29T00:00:00.000Z');

-- 整理规则默认内容（见 docs/detailed/07-mcp-scanner.md#整理规则）
INSERT INTO settings (key, value, updated_at) VALUES
  ('rules', '- 名称用官方名称；标识用小写英文、数字和连字符，与官方名称一致。
- 一句话说明写它解决什么问题，不超过 40 个字。
- 插件自带的 Skill、MCP、Hook 写进插件条目的“包含”要点；只有单独安装或单独配置过的才建独立条目。
- 安装命令放进片段并标记为安装命令；配置里的密钥一律写成 ${变量名}。
- 标签优先从已有标签里选；需要新标签时在理由里说明。
- 本机确认在用的，状态记为“在用”；只是听说、还没装的，记为“想试”。
- 同一个官方项目的重复条目合并为一条，保留信息更完整的那条。
- 每个提案的理由写清依据：来自哪个文件、哪个网页或哪次对话。', '2026-09-29T00:00:00.000Z');
