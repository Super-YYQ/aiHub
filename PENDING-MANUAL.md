# 待人工处理事项

> 实现过程中遇到的、需要账号/凭据/真机/外部服务才能完成的步骤集中在这里。
> 全部代码与测试已就绪；按下面的顺序操作即可上线。

## WP9 部署（docs/detailed/06-ops.md#首次部署）

需要 Cloudflare 账号与域名，按首次部署表逐步执行：

1. `wrangler d1 create ai-kit`，把返回的 `database_id` 填进 `apps/worker/wrangler.jsonc`（当前为占位 `00000000-…`）。
2. `pnpm --filter @aikit/worker run migrate:remote` 建表。
3. 选定子域名，在 `wrangler.jsonc` 加 `"routes": [{ "pattern": "<子域名>", "custom_domain": true }]`。
4. Zero Trust 控制台配 Access 应用 + 邮箱验证码策略 + 各用途服务令牌（agent/capture/backup），复制 AUD 填进 `wrangler.jsonc` 的 `ACCESS_TEAM_DOMAIN`、`ACCESS_AUD`、`ALLOWED_EMAILS`、`SERVICE_TOKEN_ROLES`。
5. GitHub 仓库 Secrets：`CLOUDFLARE_API_TOKEN`（Workers 脚本 + D1 编辑权限）、`CLOUDFLARE_ACCOUNT_ID`；推送 main 触发 `deploy.yml`。
6. 冒烟检查（06-ops）：浏览器登录后 `/api/me` 返回 `role: owner`；无令牌 curl `/api/health` 被 Access 拦下；`backup` 令牌 `GET /api/export` 200 且 `POST /api/capture` 403。
7. 设置页用 `prototype` 模式导入原型数据，或按数据收集规则说明让 AI 收集。

## WP10 备份（docs/detailed/06-ops.md#备份）

需要 GitHub 私有仓库 `ai-kit-data`、坚果云账号、age 密钥对：

1. 建 GitHub 私有仓库 `ai-kit-data`；建 fine-grained PAT（仅该仓库 Contents 读写，设到期时间）。
2. 坚果云建目录 `ai-kit/snapshots`，生成“第三方应用密码”。
3. 生成 age 密钥对：`age-keygen -o key.txt`；公钥放 Actions secret `AGE_RECIPIENT`，私钥离线保存在密码管理器。
4. 仓库 Secrets：`AIKIT_ORIGIN`、`CF_ACCESS_CLIENT_ID`、`CF_ACCESS_CLIENT_SECRET`（backup 令牌）、`DATA_REPO_TOKEN`、`JGY_USER`、`JGY_APP_PASSWORD`、`AGE_RECIPIENT`。
5. 手动触发一次 `backup.yml`（workflow_dispatch），确认 `ai-kit-data` 出现 `entries/`、`stacks/`、`export.json`，坚果云出现当天加密快照。

## WP8 PWA 真机验证

- 用手机浏览器打开线上地址 → 添加到主屏 → 以独立窗口打开。
- 断网后重新打开，仍能浏览和搜索（Dexie 缓存）。
- 发布新版本后出现“有新版本，刷新后生效”提示。
- （PWA 的 manifest/Service Worker 代码已在 WP8 实现；需要线上地址才能真机验证。）

## WP13 手机快捷指令

- iOS 快捷指令：调用 `POST /api/capture`，请求头带 `capture` 角色服务令牌（`CF-Access-Client-Id/Secret`），输入文字后档案出现待整理条目。
- Android：manifest 的 `share_target` 已声明；在真机上从浏览器“分享到 AI 工作台”，验证记录面板预填链接。

## WP14/WP15 MCP 接入验证

需要线上地址 + `agent` 角色服务令牌后，在本机执行：

```bash
claude mcp add --transport http --scope user aikit https://<子域名>/mcp \
  --header "CF-Access-Client-Id: $AIKIT_CLIENT_ID" \
  --header "CF-Access-Client-Secret: $AIKIT_CLIENT_SECRET"
```

验证（09-tasks WP15 验收）：`/mcp` 里能看到全部工具；搜索“我档案里的 MCP”返回正确结果；`capture` 生成待整理；`propose_change` 生成提案不改条目；含密钥草稿被拒绝；`get_rules` 返回整理规则；`backup` 令牌调 `/mcp` 返回 403。

## CI 上的 E2E 与视觉基线

- `ci.yml` 目前跑 lint/typecheck/test/build；Playwright E2E 需要在 CI 里装浏览器（`pnpm --filter @aikit/web exec playwright install --with-deps chromium`）后加跑 `test:e2e`（首次接入建议单独 job）。
- WP7A–D 的 30 种组合截图基线：首次在 CI 生成并提交到仓库（如 `e2e/__screenshots__/`），之后改动引起截图变化时在 PR 附对比图。

## 备注

- 本地开发环境（.dev.vars 不提交）：`ENVIRONMENT=development` + `DEV_AUTH_EMAIL=你的邮箱`；`pnpm dev` 前先 `pnpm --filter @aikit/worker run migrate:local` 和 `pnpm seed`。
- 测试配置 `wrangler.test.jsonc`/`wrangler.dev.jsonc` 只用于本地与测试，不用于部署。
