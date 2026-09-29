# 05 安全

## 风险与对策

| 风险 | 对策 |
| --- | --- |
| 未经授权访问 | Access 保护整个子域名；Worker 再校验一次 JWT；关闭 `workers.dev` 路由 |
| 绕过 Access 直接请求 Worker | `workers_dev: false`；没有合法 JWT 的请求一律拒绝，只有本地开发例外 |
| 密钥被存进档案 | 所有写入路径做密钥扫描，命中就拒绝；只记录环境变量名 |
| 服务令牌泄露 | 每个用途一个令牌，只给最小角色，设到期时间，可单独吊销 |
| AI 改坏数据 | `agent` 角色只能读取、快速记录和提交提案，改动要用户确认；所有写入都有修订，可以恢复 |
| 用户内容注入脚本 | Markdown 禁用原始 HTML，片段和字段按纯文本渲染，设置 CSP |
| 备份外泄 | 数据仓库私有；坚果云快照加密后上传；访问令牌只给单一仓库的最小权限 |
| 扫描器读到敏感文件 | 只读白名单里的文件，在本机脱敏后才上传，见 [07](07-mcp-scanner.md#读取范围) |

## Access 配置

1. Zero Trust 控制台新建自托管应用，域名填部署时确定的子域名，路径覆盖全部。
2. 登录方式：一次性验证码（邮箱），可再加 GitHub。会话时长按习惯设置，手机上不必频繁登录。
3. 策略一：动作 Allow，包含本人邮箱。
4. 策略二：动作 Service Auth，包含下面每个服务令牌（在 Access 里为每个用途单独创建令牌）。
5. 在应用概览里复制 AUD 标签，填到 Worker 的 `ACCESS_AUD`。

程序调用时带请求头 `CF-Access-Client-Id` 和 `CF-Access-Client-Secret`，Access 验证后把 JWT 转发给 Worker，和浏览器登录走同一条校验路径。

## JWT 校验

鉴权中间件对每个请求执行（请求头名和密钥地址已按 Access 文档核对）：

1. 读取请求头 `Cf-Access-Jwt-Assertion`；没有则返回 401。
2. 用 jose 校验：密钥集取自 `${ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`（`createRemoteJWKSet`，在模块作用域复用以便缓存），`jwtVerify` 同时校验签名、`issuer` 等于 `ACCESS_TEAM_DOMAIN`、`audience` 包含 `ACCESS_AUD`、未过期。
3. 判断身份：
   - 载荷里有 `email`：必须在 `ALLOWED_EMAILS` 里，角色为 `owner`。
   - 服务令牌：按令牌标识在 `SERVICE_TOKEN_ROLES` 里查角色。服务令牌 JWT 中标识令牌的声明名（预期是 `common_name`，对应 Client ID）开发时先用真实令牌抓一次载荷确认。
   - 都不满足返回 403。
4. 把 `{ kind, email, role, actor }` 放进请求上下文，供权限检查和修订的 `actor` 使用。

本地开发时，只有 `ENVIRONMENT=development` 且设置了 `DEV_AUTH_EMAIL` 才跳过校验。测试里要覆盖：`ENVIRONMENT=production` 时缺少 JWT 必须返回 401。

## 角色与权限

| 角色 | 谁用 | 允许 |
| --- | --- | --- |
| `owner` | 本人，浏览器登录 | 全部接口 |
| `agent` | Claude Code、Codex 等通过 MCP 访问 | 读取条目、环境、字典、安装清单、整理规则；快速记录；提交提案；`/mcp` |
| `capture` | 手机快捷指令 | 只有 `POST /api/capture` |
| `backup` | GitHub Actions 备份任务 | 只有 `GET /api/export` |
| `scanner` | 本机扫描器 | `GET /api/stacks`、`POST /api/scan-runs` |

`SERVICE_TOKEN_ROLES` 示例：`{"<agent 令牌的 Client ID>": "agent", "<备份令牌的 Client ID>": "backup"}`。

## 密钥扫描

规则放在 `packages/shared`，前端在保存前提示，服务端在所有写入路径强制执行：新建、修改、恢复条目，快速记录，提案，导入，扫描上传。扫描范围是条目的名称、说明、标签、要点的值、片段、链接、笔记。

| 规则 ID | 匹配（正则） |
| --- | --- |
| `anthropic-key` | `sk-ant-[A-Za-z0-9_-]{20,}` |
| `openai-key` | `sk-(proj-)?[A-Za-z0-9_-]{20,}` |
| `github-token` | `gh[pousr]_[A-Za-z0-9]{36,}` 或 `github_pat_[A-Za-z0-9_]{22,}` |
| `aws-access-key` | `AKIA[0-9A-Z]{16}` |
| `google-api-key` | `AIza[0-9A-Za-z_-]{35}` |
| `slack-token` | `xox[baprs]-[A-Za-z0-9-]{10,}` |
| `private-key` | `-----BEGIN [A-Z ]*PRIVATE KEY-----` |
| `jwt` | `eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}` |
| `assignment` | `(api[_-]?key\|secret\|token\|password\|passwd)\s*[:=]\s*['"]?[^\s'"$<]{12,}`（不区分大小写） |

表格里的 `\|` 是 Markdown 表格的转义写法，代码里的正则写 `|`。

- 这些写法是占位符，不算命中：`${VAR}`、`$VAR`、`<your-token>`、全大写的 `YOUR_TOKEN` 形式、`***`。
- 命中时返回 422 `secret_detected`，`details` 给出字段路径、规则 ID 和脱敏预览（前 4 位 + `…` + 后 4 位）。界面提示改成 `${环境变量名}`。
- 没有“忽略这次命中”的开关；示例值请写成占位符。
- 每条规则都要有正例和反例单元测试，反例至少覆盖上面的占位符写法。

## 内容安全

- Markdown 用 markdown-it 渲染，`html: false`；链接只允许 `http:`、`https:`、`mailto:`，加 `rel="noopener noreferrer"` 并在新窗口打开。
- 片段、要点、名称等一律用 Vue 文本插值渲染；只有 `MarkdownView` 组件输出 HTML。
- 响应头：

  ```
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  ```

  静态资源的响应头优先用静态资源目录里的 `_headers` 文件设置（开发时核对 Workers 静态资源对它的支持）；如果不支持，就把 `run_worker_first` 设为 `true`，由 Worker 统一加响应头。接口响应由 Worker 中间件加同样的头。

## 数据与备份的保护

- `ai-kit-data` 设为私有仓库。备份任务推送用的 fine-grained PAT 只授权这一个仓库的 Contents 读写，设到期时间。
- 坚果云使用“第三方应用密码”。快照先用 age 加密再上传：公钥放在 Actions secret 里，私钥离线保存在密码管理器。
- Access 服务令牌、GitHub PAT、坚果云应用密码都登记到期日，到期前一个月轮换。
- 日志只记录请求元数据，不记录条目内容、请求头和令牌。
