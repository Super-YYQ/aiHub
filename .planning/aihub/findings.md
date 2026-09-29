# 关键事实与决定（据代码/文档核对）

- 内置类型色（浅色，取自 prototype/styles.css `--t-*`）：tool #2f6db5 · prompt #8349bd · skill #237f50 · mcp #c43d32 · hook #a36700 · plugin #0b7a87 · config #56626f · model #ad3571。深色另一套见 styles.css。
- 内置类型顺序：tool, prompt, skill, mcp, hook, plugin, config, model（sort 依此）。
- 内置平台：claude-code, codex, cursor, claude-app, chatgpt, general。
- 字段模板 fieldTemplate（据 app.js TYPES）：见 shared/dictionaries。
- 种子：21 条目、3 环境（prototype/data.js）。原型条目字段 stacks=环境id数组、desc→description、createdAt/updatedAt 为 YYYY-MM-DD 需补 T00:00:00.000Z。
- 搜索权重（04-frontend / app.js）：类型ID或类型名==词 +10；title/slug 前缀 +12 含 +8；meta(说明/标签/要点值/类型名) +4；deep(片段label+code/body) +1；archived -3；pinned +1。每个词都要命中(AND)。
- 密钥扫描规则见 05-security；占位符 ${VAR} $VAR <x> YOUR_TOKEN *** 不算命中。命中返回脱敏预览 前4+…+后4。
- capture 转换：整段是 URL→标题取 host+path 去尾/；否则第一行前60字符。>60且 prompt 存 snippet，其它存 body。URL 存 links。
- Markdown 序列化：YAML 头键序 id,type,title,status,pinned,rating,platforms,tags,stacks(环境名),created,updated,fields；字符串 JSON 双引号；围栏=最长连续反引号+1 最少3；确定性字节一致。注意 02-data-model 头顺序与 app.js 略有差异——以 02-data-model 为准（id,type,title,status,pinned,rating,platforms,tags,stacks,created,updated,fields）。
- 写入 batch 顺序：校验+密钥扫描→比对version→写revision(更新/删除)→写实体version+1→写change_log。软删除写 deleted_at 并删 stack_entries。
- 同步：change_log seq>since 升序 limit，去重取当前状态，删除只返回 id，proposals 仅 pending。since=0 全量 cursor=max seq。
- ID：ULID，服务端生成；离线允许客户端生成并作 Idempotency-Key。
- 列名 snake_case ↔ JSON camelCase，仅 db 层转换。时间 UTC ISO8601 服务端赋值。

## 待核对（版本相关，动手前查锁定版）

- @cloudflare/vitest-pool-workers、drizzle-kit、hono 版本 API。
- Cloudflare Agents SDK createMcpHandler 导入路径（WP15）。
- Workers 静态资源 _headers 支持（WP 安全头）。
