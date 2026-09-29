# 07 AI 接入与数据收集

档案本身只负责存储和展示。AI 代理通过 MCP 使用档案、按规则整理，并帮忙收集本机配置。没有内置的本机扫描器：收集靠把[数据收集规则说明](#数据收集规则说明)交给在本机运行的 AI 代理，由它按规则读取、脱敏后以提案提交，用户确认后才写入。是否内置扫描器以后再看。

AI 只写档案，不改本机配置文件。把档案里的配置装到机器上，由用户自己或 AI 代理按安装清单执行，执行每条命令前由用户确认。

## AI 能做什么

| 能力 | 做什么 | 怎么写入档案 |
| --- | --- | --- |
| 使用 | 查询条目、环境、安装清单，按片段帮忙安装配置 | 只读，不写 |
| 收集 | 按数据收集规则说明读取本机真实配置，脱敏后整理成条目草稿 | `propose_change` 生成提案，用户确认后写入 |
| 整理 | 按整理规则补全说明、打标签、合并重复项 | `propose_change` 生成提案，用户确认后写入 |
| 记录 | 把看到的新工具随手记下 | `capture` 直接进“待整理” |

## 典型流程

**冷启动（档案为空）**
1. 先导入原型数据（`prototype` 模式）或新建几条，把档案跑起来。
2. 在主力电脑上让 AI 代理（Claude Code、Codex）读取[数据收集规则说明](#数据收集规则说明)，按规则读取本机配置。
3. AI 逐项脱敏，把每项整理成条目草稿，调用 `propose_change` 生成“新建”提案，理由里写清来自哪个文件。
4. 在“待确认”页检查后接受：条目入库，可在环境页把它们加入对应环境。
5. 让 AI 再按整理规则补全说明、打标签、合并重复项，同样以提案出现，由你确认。

**AI 日常使用**
- “按我的档案给这个项目配好 MCP”：代理用 `search_entries`、`get_entry` 查到条目，按片段执行安装。
- “把这个工具记到档案里”：代理调用 `capture`，条目进入待整理。
- “整理一下待整理”：代理按整理规则逐条调用 `propose_change`。

**收集一台机器的配置**：在那台机器上让 AI 按数据收集规则说明读取配置，脱敏后提交提案。装了新工具或改过配置后可以再收集一次；是否与已有条目重复，由 AI 先用 `search_entries` 查重、再由你在待确认页判断。

**新机器安装**：代理调用 `get_stack_checklist` 取得安装清单，逐项执行，每条命令先征得你同意。

## 提案

提案是“一份改动草稿加一条理由”。AI 代理可以随意提出，只有用户接受后才会改动档案。

- 类型：`create` 新建、`update` 修改（也用于调整环境成员关系）、`archive` 标记为已弃用、`merge` 合并重复条目。
- 草稿和正常写入走同样的校验与密钥扫描；`update` 带 `baseVersion`，目标条目已被改过时，提案标为过期，由用户重新判断。
- 接受时按正常写入规则落库，修订记录里写明来自哪个提案。
- 字段见 [02-data-model](02-data-model.md#提案)，接口见 [03-api](03-api.md#提案)，界面见 [04-frontend](04-frontend.md#页面规格)。

## 整理规则

整理规则是一段 Markdown，存在设置里（键 `rules`，见 [02](02-data-model.md#设置)），在“数据与设置 → 整理规则”页编辑。MCP 把它作为资源和工具提供给 AI，所有 AI 按同一份规则整理。默认内容：

```markdown
- 名称用官方名称；标识用小写英文、数字和连字符，与官方名称一致。
- 一句话说明写它解决什么问题，不超过 40 个字。
- 插件自带的 Skill、MCP、Hook 写进插件条目的“包含”要点；只有单独安装或单独配置过的才建独立条目。
- 安装命令放进片段并标记为安装命令；配置里的密钥一律写成 ${变量名}。
- 标签优先从已有标签里选；需要新标签时在理由里说明。
- 本机确认在用的，状态记为“在用”；只是听说、还没装的，记为“想试”。
- 同一个官方项目的重复条目合并为一条，保留信息更完整的那条。
- 每个提案的理由写清依据：来自哪个文件、哪个网页或哪次对话。
```

## MCP 端点

- 路径 `/mcp`，Streamable HTTP，无状态。用 Cloudflare Agents SDK 的 `createMcpHandler()` 实现（Cloudflare 文档推荐新建的无状态服务器用它；导入路径和参数开发时按锁定版本核对）。
- 鉴权走 Access 服务令牌，角色 `agent`。工具只调用服务层，和 REST 接口共享同一套校验与权限。
- 输出控制大小：笔记超过 20,000 字符时截断并注明，列表默认 20 条、最多 50 条。

**工具**

| 名称 | 输入 | 输出 |
| --- | --- | --- |
| `search_entries` | `query`，可选 `type`、`status`、`stack`、`limit` | 条目摘要列表：`id`、`type`、`slug`、`title`、`summary`、`status`、`tags`、`platforms`、`stacks` |
| `get_entry` | `id`，或 `type` + `slug` | 条目的 Markdown（与导出格式相同）和 `id`、`version` |
| `list_stacks` | 无 | 环境列表：`id`、`name`、`kind`、`os`、`entryCount` |
| `get_stack_checklist` | `stack`（ID 或名称） | 安装清单 Markdown |
| `capture` | `type`、`text`，可选 `sourceUrl` | 新条目的 `id`、`title`，状态为待整理 |
| `list_inbox` | 可选 `limit` | 待整理条目摘要，以及待确认提案的数量 |
| `propose_change` | `kind`，`targetId`（新建时省略），`draft`（完整条目草稿），`mergeIds`（合并时），`reason` | 提案 `id` 和状态；校验失败时返回具体原因，AI 可以据此修正后重试 |
| `get_rules` | 无 | 整理规则 Markdown |
| `get_collection_rules` | 无 | 数据收集规则说明 Markdown |

**资源**：`aikit://rules`（整理规则）、`aikit://collection-rules`（数据收集规则说明）、`aikit://entries/{type}/{slug}`（单个条目的 Markdown）。

**提示词**
- `collect_config`（参数 `stack`）：读取数据收集规则说明，按规则读取本机白名单文件，逐项脱敏并整理成条目草稿，用 `propose_change` 提交，最后汇总提交了哪些提案。
- `organize_inbox`：按整理规则逐条处理待整理条目，每条补全后调用 `propose_change`，最后汇总提交了哪些提案。
- `setup_machine`（参数 `stack`）：读取安装清单，列出安装计划，每执行一条命令前先征得用户同意。

**客户端配置示例**（Claude Code；令牌值放在本机环境变量里，命令写法已按 Claude Code 文档核对）：

```bash
claude mcp add --transport http --scope user aikit https://<子域名>/mcp \
  --header "CF-Access-Client-Id: $AIKIT_CLIENT_ID" \
  --header "CF-Access-Client-Secret: $AIKIT_CLIENT_SECRET"
```

Codex 在 `~/.codex/config.toml` 的 `[mcp_servers.aikit]` 下配置同一个地址和请求头，写法按 Codex 当时的文档。

## 数据收集规则说明

这份说明随应用发布、只读，内容就是本节（不像[整理规则](#整理规则)那样存在设置里可改）。把它交给在本机运行的 AI 代理（如 Claude Code、Codex），让它把本机的 AI 配置收进档案；MCP 也通过资源 `aikit://collection-rules`、工具 `get_collection_rules` 和提示词 `collect_config` 提供同一份内容。AI 按三步做：只读白名单里的文件 → 在本机脱敏 → 整理成条目草稿用 `propose_change` 提交。收集靠 AI 按规则读取，不是固定脚本，结果可能有出入，一切以“待确认”页的人工确认为准。

### 读取范围

只读取下表列出的位置，不打开白名单以外的文件。2026-09-29 已在本机确认这些文件和目录存在；具体字段以各工具当时的文档为准。

| 工具 | 位置 | 读取内容 | 生成的条目 |
| --- | --- | --- | --- |
| Claude Code | `~/.claude/plugins/installed_plugins.json` | 插件 `名称@市场`、版本 | 插件 |
| Claude Code | `~/.claude/plugins/known_marketplaces.json`，settings 中的 `extraKnownMarketplaces` | 市场名与来源仓库 | 并入插件条目的“市场”“来源仓库”要点 |
| Claude Code | `~/.claude/settings.json`、`~/.claude/settings.local.json` | `enabledPlugins`；`hooks`（每个事件 + 匹配器一条）；`permissions` 规则原文；`env` 只取变量名 | Hook、配置 |
| Claude Code | `~/.claude.json` | 用户级 `mcpServers`；指定项目时读取对应项目的本地级 `mcpServers` | MCP |
| Claude Code | `<项目>/.mcp.json` | 项目级 MCP | MCP |
| Claude Code | `~/.claude/CLAUDE.md`、`<项目>/CLAUDE.md` | 全文 | 配置 |
| Claude Code | `~/.claude/skills/*/SKILL.md`、`~/.claude/commands/*.md`、`~/.claude/agents/*.md` | frontmatter 的名称和描述 | Skill、配置 |
| Claude Code | `~/.claude/hooks/*` | 被 Hook 引用的脚本 | 作为对应 Hook 条目的片段 |
| Codex | `~/.codex/config.toml` | `[mcp_servers.*]`、`[plugins."名称@市场"]`、`[marketplaces.*]`、`[features]` 与模型设置 | MCP、插件、配置 |
| Codex | `~/.codex/hooks.json` | Hook 定义 | Hook |
| Codex | `~/.codex/AGENTS.md`、`~/.codex/rules/*.rules` | 全文 | 配置 |
| Codex | `~/.codex/skills/*/SKILL.md`、`~/.codex/prompts/*.md` | 名称、描述或正文 | Skill、提示词 |

以下位置不要打开：登录凭据（如 `~/.codex/auth.json`、`.sandbox-secrets`、`~/.claude/.credentials.json`）、对话历史与会话（`history.jsonl`、`sessions/`、`projects/`、`archived_sessions/`）、数据库文件（`*.sqlite`）、缓存与日志目录。

### 脱敏

提交前先在本机脱敏（提交后服务端仍会做密钥扫描，命中即拒绝，见 [05](05-security.md#密钥扫描)）：

1. 结构化配置里，键名匹配 `env`、`headers`、`token`、`secret`、`key`、`password`、`authorization`、`cookie`（不区分大小写）的值：环境变量写成 `${变量名}`，请求头写成 `${REDACTED_HEADER}`，其余写成 `${REDACTED}`。
2. 再对所有字符串按密钥扫描规则（[05](05-security.md#密钥扫描)）检查一遍，命中的片段替换为 `${REDACTED:<规则 ID>}`。
3. 提交前把要写入的内容列给用户看一眼，说明脱敏了多少处，确认没有残留敏感值。

### 整理成提案

每个配置项整理成一个条目草稿，用 `propose_change` 提交：

- 先用 `search_entries` 查重：档案里没有同一对象时用 `create`；已有同类型同标识（或插件的 `名称@市场` 相同）时用 `update`，把新信息并进去。
- `draft` 按条目 schema 填类型、名称、标识、要点、片段、平台；安装命令放进片段并标记为安装命令；密钥写成 `${变量名}`。
- 状态和其余细节按[整理规则](#整理规则)：本机确认在用的记为“在用”。
- `reason` 写清依据：来自哪个文件。
- 需要归到某个环境时，在提案理由里说明，或接受后在环境页把条目加入该环境。
