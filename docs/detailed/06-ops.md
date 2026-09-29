# 06 运维

## 首次部署

按顺序执行，每步完成后再做下一步。

| 步骤 | 做法 | 完成标准 |
| --- | --- | --- |
| 1. 建库 | `wrangler d1 create ai-kit`，把返回的 `database_id` 填进 `wrangler.jsonc`；可指定靠近亚洲的位置提示（参数以 wrangler 文档为准） | `wrangler d1 list` 能看到 `ai-kit` |
| 2. 建表 | `wrangler d1 migrations apply ai-kit --remote` | 迁移全部显示已应用 |
| 3. 定域名 | 选定子域名，在 `wrangler.jsonc` 加 `"routes": [{ "pattern": "<子域名>", "custom_domain": true }]` | 部署后子域名能解析 |
| 4. 配 Access | 按 [05-security](05-security.md#access-配置) 建应用、两条策略和各用途的服务令牌 | 浏览器打开子域名会跳到 Access 登录页 |
| 5. 填配置 | `ACCESS_TEAM_DOMAIN`、`ACCESS_AUD`、`ALLOWED_EMAILS`、`SERVICE_TOKEN_ROLES` | 配置项全部非空 |
| 6. 发布 | GitHub 配好 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`，推送 main 触发 `deploy.yml` | 流水线成功 |
| 7. 冒烟 | 见下方检查 | 全部符合预期 |
| 8. 导入 | 设置页导入原型数据（`prototype` 模式），或运行扫描器 | 工作台显示条目 |

冒烟检查：

- 浏览器登录后能打开工作台，`/api/me` 返回 `role: owner`。
- 不带令牌的 `curl https://<子域名>/api/health` 被 Access 拦下。
- 带 `backup` 令牌请求 `GET /api/export` 返回 200；同一令牌请求 `POST /api/capture` 返回 403。

## 备份

`backup.yml` 放在代码仓库 `ai-kit`，每天 UTC 19:17（北京时间 03:17）运行，也可手动触发：

1. 用 `backup` 令牌下载 `GET /api/export`，检查 `schemaVersion` 和条目数（为 0 时停止，防止用空数据覆盖镜像）。
2. `node tools/backup/to-markdown.mjs export.json out/` 生成 Markdown 目录（格式见 [02](02-data-model.md#markdown-镜像)）。
3. 检出 `ai-kit-data`，用 `out/` 覆盖 `entries/`、`stacks/`、`README.md`，再放入 `export.json`；有变化才提交并推送。
4. `age` 加密 `export.json`，上传到坚果云 `ai-kit/snapshots/YYYY-MM-DD.json.age`。

需要的 Secrets：`AIKIT_ORIGIN`、`CF_ACCESS_CLIENT_ID`、`CF_ACCESS_CLIENT_SECRET`（backup 令牌）、`DATA_REPO_TOKEN`、`JGY_USER`、`JGY_APP_PASSWORD`、`AGE_RECIPIENT`。

```yaml
name: backup
on:
  schedule:
    - cron: '17 19 * * *'
  workflow_dispatch:
jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/checkout@v4
        with: { repository: <你的账号>/ai-kit-data, token: '${{ secrets.DATA_REPO_TOKEN }}', path: data }
      - name: 导出
        run: |
          curl -fsS "${{ secrets.AIKIT_ORIGIN }}/api/export" \
            -H "CF-Access-Client-Id: ${{ secrets.CF_ACCESS_CLIENT_ID }}" \
            -H "CF-Access-Client-Secret: ${{ secrets.CF_ACCESS_CLIENT_SECRET }}" \
            -o export.json
          node tools/backup/check-export.mjs export.json
      - name: 生成 Markdown 并提交
        run: |
          node tools/backup/to-markdown.mjs export.json out
          rm -rf data/entries data/stacks && cp -r out/entries out/stacks out/README.md data/ && cp export.json data/
          cd data && git add -A
          git -c user.name=aikit-bot -c user.email=aikit-bot@users.noreply.github.com commit -m "backup: $(date -u +%F)" || echo "无变化"
          git push
      - name: 加密并上传坚果云
        run: |
          sudo apt-get install -y age
          age -r "${{ secrets.AGE_RECIPIENT }}" -o snapshot.age export.json
          curl -fsS -u "${{ secrets.JGY_USER }}:${{ secrets.JGY_APP_PASSWORD }}" \
            -T snapshot.age "https://dav.jianguoyun.com/dav/ai-kit/snapshots/$(date -u +%F).json.age"
```

- `actions/checkout` 等 Action 的版本开发时取当时的最新主版本。先在坚果云里建好 `ai-kit/snapshots` 目录；快照很小，可以一直保留。
- 定时任务失败时，GitHub 会给最后修改该定时配置的人发邮件。

## 恢复

| 情况 | 做法 |
| --- | --- |
| 改错或删错一条 | 详情页“历史版本”里选中修订，“恢复此版本” |
| 7 天内的整库误操作 | D1 Time Travel 把数据库恢复到某个时间点（`wrangler d1 time-travel` 子命令，参数以 wrangler 文档为准）；免费版可回溯 7 天 |
| Cloudflare 不可用或要迁走 | 取 `ai-kit-data` 里的 `export.json`，或解密坚果云快照，部署到新环境后在设置页用 `replace` 模式导入 |

每季度演练一次：把最新快照导入本地 `wrangler dev` 环境，核对条目数和环境数与线上一致。

## 监控与排查

- 备份失败：GitHub 发邮件通知（见上文）。
- 线上排查：`wrangler tail` 查看实时日志；也可以开启 Workers 日志（observability），配置项开发时核对。
- 前端同步异常：设置页“关于”显示同步状态、上次同步时间和待上传数量。

## 额度

免费额度，数值按 Cloudflare 文档核对于 2026-09-29：

| 项目 | 免费额度 | 本项目预估 |
| --- | --- | --- |
| D1 单库大小 | 500 MB | 几 MB |
| D1 账户总存储 | 5 GB | |
| D1 读取行数 | 500 万行/天 | 远低于此 |
| D1 写入行数 | 10 万行/天 | 每次保存约 3–5 行 |
| D1 Time Travel | 7 天 | |
| 单次查询绑定参数 | 100 个 | 批量写入要分批 |
| Access | 50 个用户以内免费（未在本次核对） | 1 人 |
| Workers 请求 | 以官方当前额度为准（未在本次核对） | 个人使用量很小 |

## Oracle 服务器

这台是 Always Free 实例。按 Oracle 文档，Always Free 实例在 7 天内满足闲置条件（其中之一是 CPU 利用率的 95 分位低于 20%）就可能被回收，所以不放在主链路上，也不放唯一一份数据。

适合的用途：

- 作为档案里的一个环境：如果在上面用 Claude Code 或 Codex，就在上面运行扫描器，把它的配置纳入档案。
- 方案 B 的冷备：代码用 Hono + Drizzle，可以改用 Node + SQLite 运行；需要时用 Docker 部署，并通过 cloudflared 隧道接入，不对公网开放端口。
- 需要常驻机器的定时任务（如每周检查插件更新），属于可选增强。
