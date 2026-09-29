# 07 AI 接入与本机扫描

## 两者分别做什么

| | 本机扫描器 | MCP 端点 |
| --- | --- | --- |
| 作用 | **收集**：读取机器上真实的 AI 配置，脱敏后交给档案 | **使用**：让 AI 代理查询档案、记录新内容、按整理规则提出修改 |
| 运行位置 | 每台要纳入档案的电脑或服务器上（配置文件在本机，云端读不到） | Worker 上的 `/mcp` |
| 是否需要 AI | 不需要，规则固定，同样的配置每次得到同样的结果 | 由 Claude Code、Codex 等代理调用 |
| 怎么写入档案 | 上传扫描结果，服务端生成提案，用户确认后写入 | 快速记录直接进待整理；修改一律生成提案 |

两者都只写档案，不改本机配置。把档案里的配置装到机器上，由用户自己或 AI 代理按安装清单执行，执行每条命令前由用户确认。

## 典型流程

**冷启动（档案为空）**
1. 在主力电脑上运行 `aikit-scan scan --stack "主力 Windows 工作站" --upload`。
2. 档案里没有任何来源记录，所有扫描项都生成“新建”提案。
3. 在“待确认”页检查后全部接受：条目入库，状态为在用，属于这个环境。
4. 让 AI 通过 MCP 按整理规则补全说明、打标签、合并重复项。这些都以提案形式出现，再由你确认。

后端还没部署时，可以先运行 `aikit-scan scan --out scan.json` 离线生成结果，部署后用 `aikit-scan upload scan.json` 上传。

**日常漂移检查**：装了新插件或改过配置后再扫一次，服务端只为有变化的项生成提案（新增、变更、本机已不存在）。

**AI 日常使用**
- “按我的档案给这个项目配好 MCP”：代理用 `search_entries`、`get_entry` 查到条目，按片段执行安装。
- “把这个工具记到档案里”：代理调用 `capture`，条目进入待整理。
- “整理一下待整理”：代理按整理规则逐条调用 `propose_change`。

**新机器**：代理调用 `get_stack_checklist` 取得安装清单，逐项执行，每条命令先征得你同意。

## 提案

提案是“一份改动草稿加一条理由”。AI 和扫描器可以随意提出，只有用户接受后才会改动档案。

- 类型：`create` 新建、`update` 修改（也用于调整环境成员关系）、`archive` 标记为已弃用、`merge` 合并重复条目。
- 草稿和正常写入走同样的校验与密钥扫描；`update` 带 `baseVersion`，目标条目已被改过时，提案标为过期，由用户重新判断。
- 接受时按正常写入规则落库，修订记录里写明来自哪个提案；来自扫描的提案被接受时，同时写入来源记录。
- 字段见 [02-data-model](02-data-model.md#提案来源与扫描)，接口见 [03-api](03-api.md#提案)，界面见 [04-frontend](04-frontend.md#页面规格)。

## 整理规则

整理规则是一段 Markdown，存在设置里（键 `rules`，见 [02](02-data-model.md#设置)），在“数据与设置 → 整理规则”页编辑。MCP 把它作为资源和工具提供给 AI，所有 AI 按同一份规则整理。默认内容：

```markdown
- 名称用官方名称；标识用小写英文、数字和连字符，与官方名称一致。
- 一句话说明写它解决什么问题，不超过 40 个字。
- 插件自带的 Skill、MCP、Hook 写进插件条目的“包含”要点；只有单独安装或单独配置过的才建独立条目。
- 安装命令放进片段并标记为安装命令；配置里的密钥一律写成 ${变量名}。
- 标签优先从已有标签里选；需要新标签时在理由里说明。
- 本机扫描到且在用的，状态记为“在用”；只是听说、还没装的，记为“想试”。
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

**资源**：`aikit://rules`（整理规则）、`aikit://entries/{type}/{slug}`（单个条目的 Markdown）。

**提示词**
- `organize_inbox`：按整理规则逐条处理待整理条目，每条补全后调用 `propose_change`，最后汇总提交了哪些提案。
- `setup_machine`（参数 `stack`）：读取安装清单，列出安装计划，每执行一条命令前先征得用户同意。

**客户端配置示例**（Claude Code；令牌值放在本机环境变量里，命令写法已按 Claude Code 文档核对）：

```bash
claude mcp add --transport http --scope user aikit https://<子域名>/mcp \
  --header "CF-Access-Client-Id: $AIKIT_CLIENT_ID" \
  --header "CF-Access-Client-Secret: $AIKIT_CLIENT_SECRET"
```

Codex 在 `~/.codex/config.toml` 的 `[mcp_servers.aikit]` 下配置同一个地址和请求头，写法按 Codex 当时的文档。

## 本机扫描器

Node CLI，代码在 `tools/scanner`，复用 `packages/shared` 的 schema、密钥扫描和序列化。

### 命令

```
aikit-scan scan --stack <环境名或 ID> [--home <目录>] [--project <目录> ...] [--out scan.json] [--upload]
aikit-scan show scan.json      # 按条目打印将要上传的内容（已脱敏），供人工检查
aikit-scan upload scan.json
```

- 默认只在终端输出摘要；写文件要 `--out`，上传要明确加 `--upload` 或使用 `upload` 命令。
- 上传时读取环境变量 `AIKIT_ORIGIN`、`AIKIT_CLIENT_ID`、`AIKIT_CLIENT_SECRET`（`scanner` 角色的服务令牌）。
- `--stack` 用名称时先调用 `GET /api/stacks` 解析为 ID；找不到就提示先在档案里新建这个环境。

### 读取范围

扫描器只读取下表列出的位置。每种来源一个读取器，单独实现、单独测试；工具升级改了文件格式时，只改对应的读取器。2026-09-29 已在本机确认这些文件和目录存在；具体字段以各工具当时的文档为准。

| 工具 | 位置 | 读取内容 | 生成的条目 |
| --- | --- | --- | --- |
| Claude Code | `~/.claude/plugins/installed_plugins.json` | 插件 `名称@市场`、版本 | 插件 |
| Claude Code | `~/.claude/plugins/known_marketplaces.json`，settings 中的 `extraKnownMarketplaces` | 市场名与来源仓库 | 并入插件条目的“市场”“来源仓库”要点 |
| Claude Code | `~/.claude/settings.json`、`~/.claude/settings.local.json` | `enabledPlugins`；`hooks`（每个事件 + 匹配器一条）；`permissions` 规则原文；`env` 只取变量名 | Hook、配置 |
| Claude Code | `~/.claude.json` | 用户级 `mcpServers`；指定 `--project` 时读取对应项目的本地级 `mcpServers` | MCP |
| Claude Code | `<项目>/.mcp.json` | 项目级 MCP | MCP |
| Claude Code | `~/.claude/CLAUDE.md`、`<项目>/CLAUDE.md` | 全文 | 配置 |
| Claude Code | `~/.claude/skills/*/SKILL.md`、`~/.claude/commands/*.md`、`~/.claude/agents/*.md` | frontmatter 的名称和描述 | Skill、配置 |
| Claude Code | `~/.claude/hooks/*` | 被 Hook 引用的脚本 | 作为对应 Hook 条目的片段 |
| Codex | `~/.codex/config.toml` | `[mcp_servers.*]`、`[plugins."名称@市场"]`、`[marketplaces.*]`、`[features]` 与模型设置 | MCP、插件、配置 |
| Codex | `~/.codex/hooks.json` | Hook 定义 | Hook |
| Codex | `~/.codex/AGENTS.md`、`~/.codex/rules/*.rules` | 全文 | 配置 |
| Codex | `~/.codex/skills/*/SKILL.md`、`~/.codex/prompts/*.md` | 名称、描述或正文 | Skill、提示词 |

以下位置不在白名单里，扫描器不打开：登录凭据（如 `~/.codex/auth.json`、`.sandbox-secrets`、`~/.claude/.credentials.json`）、对话历史与会话（`history.jsonl`、`sessions/`、`projects/`、`archived_sessions/`）、数据库文件（`*.sqlite`）、缓存与日志目录。

### 脱敏

1. 结构化配置里，键名匹配 `env`、`headers`、`token`、`secret`、`key`、`password`、`authorization`、`cookie`（不区分大小写）的值：环境变量写成 `${变量名}`，请求头写成 `${REDACTED_HEADER}`，其余写成 `${REDACTED}`。
2. 再对所有字符串跑一遍密钥扫描（[05](05-security.md#密钥扫描)），命中的片段替换为 `${REDACTED:<规则 ID>}`。
3. 终端摘要里报告脱敏了多少处；`show` 命令逐条列出，方便上传前检查。

### 来源键

格式 `<工具>:<种类>:<作用域>:<标识>`，例如：

```
claude-code:plugin:user:superpowers@claude-plugins-official
claude-code:mcp:user:playwright
claude-code:mcp:project:<项目目录名>:context7
claude-code:hook:user:PostToolUse:Edit|Write:0
claude-code:config:user:CLAUDE.md
codex:mcp:user:playwright
codex:config:user:AGENTS.md
```

每个扫描项的结构：`sourceKey`、`tool`、`kind`、`scope`、`name`、`draft`（条目草稿：类型、名称、标识、要点、片段、平台）、`fingerprint`（脱敏后配置的规范化 JSON 的 SHA-256）。

### 漂移与提案

服务端收到 `POST /api/scan-runs` 后，逐项处理：

| 情况 | 处理 |
| --- | --- |
| 本环境没有这个来源键，档案里也找不到同一对象 | 生成 `create` 提案：状态在用，属于本环境 |
| 本环境没有这个来源键，但档案里已有同一对象（同类型同标识，或插件的 `名称@市场` 相同） | 生成 `update` 提案：把条目加入本环境，并补充扫描到的信息 |
| 来源键存在，指纹相同 | 只更新 `lastSeenAt`，不生成提案 |
| 来源键存在，指纹不同 | 生成 `update` 提案，理由是“本机配置已变化”，附新旧差异 |
| 档案记录了本环境的来源，这次没扫到 | 生成 `update` 提案：把条目移出本环境（不弃用条目，它可能还在其他机器上用） |

处理完返回各类数量。冷启动时所有扫描项都走第一行，在待确认页批量接受即可。

### 测试

- 每个读取器用 `tools/scanner/fixtures/` 里的样例配置做单元测试，样例里放假密钥，断言输出中不出现原值。
- 端到端：用样例目录作为 `--home` 扫描，上传到本地 `wrangler dev`，断言提案数量和类型符合上表。
