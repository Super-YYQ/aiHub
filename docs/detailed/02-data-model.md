# 02 数据模型

本文件是字段定义、约束和表结构的唯一出处。接口的请求和响应体直接使用这里的实体形状（JSON 用 camelCase），Zod schema 按本文件实现。

## 实体一览

| 实体 | 表 | 说明 |
| --- | --- | --- |
| 条目 Entry | `entries` | 档案的核心记录；片段和链接以 JSON 列存在条目里 |
| 类型 Type | `types` | 条目类型字典，可自定义 |
| 平台 Platform | `platforms` | 适用平台字典，可自定义 |
| 环境 Stack | `stacks` | 用户自定义的机器或使用场景 |
| 环境成员 StackEntry | `stack_entries` | 条目属于哪些环境，附带“本环境下的备注” |
| 修订 Revision | `revisions` | 条目每次修改前的完整快照 |
| 变更日志 ChangeLog | `change_log` | 递增序号，驱动增量同步 |
| 提案 Proposal | `proposals` | AI 代理提出、等待用户确认的改动 |
| 设置 | `settings` | 键值设置，目前只有整理规则 `rules` |
| 幂等记录 | `idempotency` | 快速记录等接口的重复请求去重 |

## 条目

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| `id` | string | ULID |
| `type` | string | 必须是存在的类型 ID |
| `slug` | string | 1–64 字符；只含小写字母、数字、汉字和 `-`，不以 `-` 开头或结尾；同一类型内唯一（不含已删除条目） |
| `title` | string | 1–120 字符 |
| `summary` | string | 0–280 字符 |
| `status` | enum | `inbox` 待整理、`using` 在用、`trying` 试用中、`wishlist` 想试、`archived` 已弃用 |
| `pinned` | boolean | |
| `rating` | integer | 0–5，0 表示未评分 |
| `platforms` | string[] | 平台 ID，最多 10 个 |
| `tags` | string[] | 每个 1–32 字符，去掉首尾空白，不区分大小写去重，最多 20 个 |
| `fields` | object | 类型要点，键 1–32 字符，值 1–500 字符，最多 30 项；键的建议来自类型的 `fieldTemplate` |
| `snippets` | Snippet[] | 最多 20 个 |
| `links` | Link[] | 最多 20 个 |
| `body` | string | Markdown，最多 50,000 字符 |
| `stacks` | StackRef[] | 只出现在接口里，由 `stack_entries` 组装：`{ id, note }` |
| `version` | integer | 从 1 开始，每次写入加 1 |
| `createdAt` / `updatedAt` | string | 服务端赋值 |
| `deletedAt` | string \| null | 软删除时间 |

**片段 Snippet：** `id`（8 位随机串，条目内唯一，用于稳定引用）、`label`（0–60 字符）、`lang`（0–20 字符，如 `text`、`bash`、`powershell`、`json`、`toml`、`yaml`、`markdown`）、`code`（1–20,000 字符）、`install`（boolean，标记为安装命令）。变量从 `code` 里的 `{{名称}}` 实时解析，不单独存储；名称去掉首尾空白后比较。

**链接 Link：** `label`（0–60 字符）、`url`（只允许 `http:` 和 `https:`，最多 2,000 字符）。

**状态：** 任意两个状态之间都可以切换，界面按“待整理 → 想试 → 试用中 → 在用 → 已弃用”的顺序给出建议。默认列表不显示已弃用的条目。

## 字典与环境

| 实体 | 字段 |
| --- | --- |
| 类型 | `id`（`^[a-z][a-z0-9-]{1,23}$`）、`name`（1–20 字符）、`color`（`#RRGGBB`）、`fieldTemplate`（string[]，最多 20 项）、`sort`、`builtin` |
| 平台 | `id`（同上规则）、`name`、`sort`、`builtin` |
| 环境 | `id`（ULID）、`name`（1–40 字符，唯一）、`kind`（`pc` 电脑、`server` 服务器、`phone` 手机、`tablet` 平板、`scene` 使用场景）、`os`（`windows`、`macos`、`linux`、`ios`、`android`、`any`）、`description`（0–280 字符）、`sort` |
| 环境成员 | `stackId`、`entryId`、`note`（0–280 字符，记录本环境下的差异，如版本、路径）、`addedAt` |

- 内置类型：`tool` 工具、`prompt` 提示词、`skill` Skill、`mcp` MCP、`hook` Hook、`plugin` 插件、`config` 配置、`model` 模型与 API。内置类型可以改名、改颜色、改字段模板，不能删除。
- 内置平台：`claude-code`、`codex`、`cursor`、`claude-app`、`chatgpt`、`general`。
- 自定义类型或平台只有在没有条目引用时才能删除；删除环境只解除成员关系，不删除条目。

## 设置

`settings` 是键值表。目前只有一个键：`rules`，即整理规则的 Markdown（最多 20,000 字符），默认内容见 [07](07-mcp-scanner.md#整理规则)。写入同样经过密钥扫描，并追加 `change_log`（`entity` 记为 `setting`）。

## 提案

| 实体 | 字段 |
| --- | --- |
| 提案 | `id`（ULID）、`source`（提案来源，目前只有 `agent`）、`actor`（调用者名称）、`kind`（`create`、`update`、`archive`、`merge`）、`targetEntryId`（新建时为空）、`baseVersion`（针对的条目版本）、`payload`（新建或修改后的完整条目草稿；`merge` 时含被合并的条目 ID 列表）、`reason`（0–1,000 字符，说明依据）、`status`（`pending`、`accepted`、`rejected`、`superseded`）、`createdAt`、`decidedAt`、`decidedBy` |

目标条目的 `version` 与提案的 `baseVersion` 不一致时，提案不能直接接受，界面要先展示差异，状态改为 `superseded` 或由用户基于最新版本重新确认。

## 表结构

`apps/worker/migrations/0001_init.sql`：

```sql
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
```

同一个迁移文件末尾插入内置类型和内置平台。内置类型的颜色取原型 `prototype/styles.css` 里的浅色类型色（`--t-*` 变量），规则见 [08-ui-spec](08-ui-spec.md#共同基础)。

用 JSON 列而不是拆表：单用户、几千条以内、搜索在前端做，JSON 列最简单。需要在服务端按标签或平台统计时再拆表。外键是否生效要在迁移测试里验证；服务层写入前自己检查引用是否存在，不依赖数据库报错。

## 写入规则

条目、环境、字典的每次写入都在一个 D1 batch 里完成（D1 的 batch 按事务执行），顺序固定：

1. 用 Zod 校验，并对全部文本字段做密钥扫描（规则见 [05-security](05-security.md#密钥扫描)）；命中则整次写入失败。
2. 更新或删除时比对 `version`，不一致返回冲突（见 [03-api](03-api.md#冲突)）。
3. 更新或删除条目时，把写入前的完整条目写进 `revisions`。
4. 写入实体，`version + 1`，`updated_at` 取服务端当前时间。
5. 追加一行 `change_log`。

删除是软删除：条目写 `deleted_at`，并删除它的 `stack_entries`。已删除条目的 `slug` 可以被新条目使用。

## 导出格式

`GET /api/export` 返回下面的 JSON，也是备份和恢复用的格式：

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-09-29T19:17:00.000Z",
  "types": [],
  "platforms": [],
  "stacks": [],
  "entries": [],
  "settings": { "rules": "..." }
}
```

- `entries` 不含已删除条目，每条带 `stacks: [{ "id": "...", "note": "" }]`。
- 修订、提案不导出；恢复后历史从零开始。
- `schemaVersion` 只在导出结构不兼容时加 1；导入时按版本号转换旧格式。

## 导入

| 模式 | 行为 |
| --- | --- |
| `replace` | 清空条目、环境、成员关系后按文件重建；字典按 ID 覆盖 |
| `merge` | 按 `id` 更新或新建；与已有条目的 `(type, slug)` 冲突时，新条目的 `slug` 加 `-2`、`-3` 后缀 |
| `prototype` | 读取原型导出的 JSON（`{ stacks, entries }`），先转换再按 `merge` 导入 |

原型数据的转换规则：条目和环境重新生成 ULID；`createdAt`、`updatedAt` 从 `YYYY-MM-DD` 补成当天 `00:00:00.000Z`；条目的 `stacks`（环境 ID 数组）转换成成员关系；环境的 `desc` 改名为 `description`；缺少的字段取默认值。

## Markdown 镜像

备份任务把导出 JSON 转换成 `ai-kit-data` 仓库里的文件（转换代码在 `tools/backup`，与前端“复制为 Markdown”共用 `packages/shared` 的序列化函数）：

```
entries/<type>/<slug>.md   一个条目一个文件
stacks/<环境名>.md          环境的条目列表和安装清单
export.json                完整导出，恢复时用这个
README.md                  自动生成的目录
```

条目文件格式：

- YAML 头的键按固定顺序：`id`、`type`、`title`、`status`、`pinned`、`rating`、`platforms`、`tags`、`stacks`（环境名）、`created`、`updated`、`fields`。字符串一律写成 JSON 风格的双引号字符串（也是合法 YAML）。
- 正文依次是：一句话说明；每个片段一个二级标题（安装命令在标题后加“（安装）”）加代码块；笔记原文；二级标题“链接”下的链接列表。
- 代码块围栏长度取片段内最长连续反引号数加 1，最少 3 个，保证片段里含反引号时不破坏格式。
- 同样的输入必须生成完全相同的字节，这样 Git 历史里只出现真实改动。

Markdown 镜像只供阅读和 AI 查阅，恢复一律用 `export.json`。

## 迁移与种子数据

- 迁移文件放在 `apps/worker/migrations/`，按 `0001_init.sql`、`0002_xxx.sql` 编号，只追加不修改已发布的文件。
- 每个迁移都要有对应的迁移测试：在空库上依次执行全部迁移，再跑一遍种子数据导入。
- `apps/worker/seed/seed.json` 按上面的原型转换规则由 `prototype/data.js` 生成，供本地开发和端到端测试使用。
