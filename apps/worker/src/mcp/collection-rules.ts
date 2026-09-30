// 数据收集规则说明（07-mcp-scanner.md#数据收集规则说明）。
// 这份说明只读、随应用发布；MCP 通过资源 aikit://collection-rules、
// 工具 get_collection_rules 和提示词 collect_config 提供同一份内容。
// 注意：内容与 docs/detailed/07 的“读取范围/脱敏/整理成提案”一致，不要在代码里改写规则本身。

export const COLLECTION_RULES = `# 数据收集规则说明

把本机的 AI 配置收进档案前，先读这份说明。收集靠你（AI 代理）按规则读取，不是固定脚本；一切以"待确认"页的人工确认为准。

## 三步做法

只读白名单里的文件 → 在本机脱敏 → 整理成条目草稿用 \`propose_change\` 提交。

## 读取范围

只读取下表列出的位置，不打开白名单以外的文件。

| 工具 | 位置 | 读取内容 | 生成的条目 |
| --- | --- | --- | --- |
| Claude Code | ~/.claude/plugins/installed_plugins.json | 插件 名称@市场、版本 | 插件 |
| Claude Code | ~/.claude/plugins/known_marketplaces.json、settings 中的 extraKnownMarketplaces | 市场名与来源仓库 | 并入插件条目的"市场""来源仓库"要点 |
| Claude Code | ~/.claude/settings.json、~/.claude/settings.local.json | enabledPlugins；hooks（每个事件 + 匹配器一条）；permissions 规则原文；env 只取变量名 | Hook、配置 |
| Claude Code | ~/.claude.json | 用户级 mcpServers；指定项目时读取对应项目的本地级 mcpServers | MCP |
| Claude Code | <项目>/.mcp.json | 项目级 MCP | MCP |
| Claude Code | ~/.claude/CLAUDE.md、<项目>/CLAUDE.md | 全文 | 配置 |
| Claude Code | ~/.claude/skills/*/SKILL.md、~/.claude/commands/*.md、~/.claude/agents/*.md | frontmatter 的名称和描述 | Skill、配置 |
| Claude Code | ~/.claude/hooks/* | 被 Hook 引用的脚本 | 作为对应 Hook 条目的片段 |
| Codex | ~/.codex/config.toml | [mcp_servers.*]、[plugins."名称@市场"]、[marketplaces.*]、[features] 与模型设置 | MCP、插件、配置 |
| Codex | ~/.codex/hooks.json | Hook 定义 | Hook |
| Codex | ~/.codex/AGENTS.md、~/.codex/rules/*.rules | 全文 | 配置 |
| Codex | ~/.codex/skills/*/SKILL.md、~/.codex/prompts/*.md | 名称、描述或正文 | Skill、提示词 |

以下位置不要打开：登录凭据（如 ~/.codex/auth.json、.sandbox-secrets、~/.claude/.credentials.json）、对话历史与会话（history.jsonl、sessions/、projects/、archived_sessions/）、数据库文件（*.sqlite）、缓存与日志目录。

## 脱敏

提交前先在本机脱敏（提交后服务端仍会做密钥扫描，命中即拒绝）：

1. 结构化配置里，键名匹配 env、headers、token、secret、key、password、authorization、cookie（不区分大小写）的值：环境变量写成 \${变量名}，请求头写成 \${REDACTED_HEADER}，其余写成 \${REDACTED}。
2. 再对所有字符串按密钥扫描规则检查一遍，命中的片段替换为 \${REDACTED:<规则 ID>}。
3. 提交前把要写入的内容列给用户看一眼，说明脱敏了多少处，确认没有残留敏感值。

## 整理成提案

每个配置项整理成一个条目草稿，用 propose_change 提交：

- 先用 search_entries 查重：档案里没有同一对象时用 create；已有同类型同标识（或插件的 名称@市场 相同）时用 update，把新信息并进去。
- draft 按条目 schema 填类型、名称、标识、要点、片段、平台；安装命令放进片段并标记为安装命令；密钥写成 \${变量名}。
- 状态和其余细节按整理规则：本机确认在用的记为"在用"。
- reason 写清依据：来自哪个文件。
- 需要归到某个环境时，在提案理由里说明，或接受后在环境页把条目加入该环境。
`;
