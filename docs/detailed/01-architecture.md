# 01 架构与工程

## 技术选型

| 层 | 选型 | 说明 |
| --- | --- | --- |
| 前端 | Vue 3（Composition API、`<script setup>`）+ TypeScript + Vite | 路由 Vue Router（history 模式），状态 Pinia，本地缓存 Dexie（IndexedDB），Markdown 渲染 markdown-it |
| 后端 | Cloudflare Worker + Hono | 一个 Worker 同时托管前端静态资源、`/api/*` 和 `/mcp` |
| 数据库 | Cloudflare D1 + Drizzle ORM | 迁移用 `wrangler d1 migrations` |
| 校验 | Zod | schema 放在 `packages/shared`，前后端共用 |
| 鉴权 | Cloudflare Access + jose | Worker 内校验 Access JWT，见 [05-security](05-security.md) |
| MCP | Cloudflare Agents SDK 的 `createMcpHandler()`（无状态，Streamable HTTP） | 见 [07-mcp-scanner](07-mcp-scanner.md) |
| 测试 | Vitest；Worker 集成测试用 `@cloudflare/vitest-pool-workers`；端到端用 Playwright | |
| 包管理 | pnpm workspaces，Node LTS | |

**为什么选 Vue 3：** 模板语法接近 HTML，原型的页面结构可以几乎一对一迁移；单文件组件把结构、逻辑、样式放在一起，人工审阅 AI 写的代码更容易；中文资料多。React 同样可行，改用 React 只影响 [04-frontend](04-frontend.md) 的实现部分，接口和数据不变。

**版本策略：** 开发开始时取各依赖当时的稳定版，用 `pnpm-lock.yaml` 锁定。本文档不写版本号；凡是涉及库 API 的写法，以锁定版本的官方文档为准，动手前先核对。

## 仓库结构

```
ai-kit/
├─ apps/
│  ├─ web/                 Vue 前端：src/{pages,components,stores,lib,styles}
│  └─ worker/              Worker：src/{index.ts,routes,services,mcp,auth,db}，migrations/，wrangler.jsonc
├─ packages/
│  └─ shared/              Zod schema 与类型、Markdown 序列化、密钥扫描、搜索、变量替换
├─ tools/
│  └─ backup/              备份转换：导出 JSON → Markdown 目录
├─ prototype/              现有原型，只作参考
├─ docs/
└─ .github/workflows/      ci.yml、deploy.yml、backup.yml
```

数据镜像放在另一个私有仓库 `ai-kit-data`，由备份任务写入，见 [06-ops](06-ops.md#备份)。

## 模块职责与依赖方向

```
web ──┐
worker ├──> shared（不依赖任何应用）
backup ┘
worker: routes -> services -> db
web:    pages -> components -> stores -> api 客户端 / Dexie
```

- 业务规则（校验、密钥扫描、写修订记录、写变更日志、提案应用）只写在 `worker/services` 和 `shared` 里。路由只做参数解析和响应格式化。
- 前端提交前用同一份 Zod schema 预校验，只为提示更早；服务端校验才是准绳。
- `shared` 只依赖 Zod，能在浏览器、Worker、Node 三处运行。

## 运行拓扑

请求先经过 Access 登录，再到 Worker：`/api/*` 与 `/mcp` 进入 Worker 代码，其余路径返回前端静态资源；找不到的页面路径返回 `index.html`，交给前端路由。

`wrangler.jsonc` 骨架（键名已按 Cloudflare 文档核对；日期、ID 在创建资源后填写）：

```jsonc
{
  "name": "ai-kit",
  "main": "src/index.ts",
  "compatibility_date": "<开发开始当天>",
  "workers_dev": false,
  "assets": {
    "directory": "../web/dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*", "/mcp", "/mcp/*"]
  },
  "d1_databases": [
    { "binding": "DB", "database_name": "ai-kit", "database_id": "<创建后填写>", "migrations_dir": "migrations" }
  ],
  "vars": {
    "ENVIRONMENT": "production",
    "ACCESS_TEAM_DOMAIN": "",
    "ACCESS_AUD": "",
    "ALLOWED_EMAILS": "",
    "SERVICE_TOKEN_ROLES": "{}"
  }
}
```

自定义域名在部署时加到 `routes`（`custom_domain: true`），见 [06-ops](06-ops.md#首次部署)。

## 配置项

| 名称 | 放在哪 | 说明 |
| --- | --- | --- |
| `ENVIRONMENT` | vars | `development` 或 `production` |
| `ACCESS_TEAM_DOMAIN` | vars | 形如 `https://<团队名>.cloudflareaccess.com` |
| `ACCESS_AUD` | vars | Access 应用的 AUD 标签 |
| `ALLOWED_EMAILS` | vars | 允许登录的邮箱，逗号分隔 |
| `SERVICE_TOKEN_ROLES` | vars（JSON） | 服务令牌 Client ID 到角色的映射，角色见 [05-security](05-security.md#角色与权限) |
| `DEV_AUTH_EMAIL` | `.dev.vars`（不提交） | 仅本地开发：跳过 Access 时使用的身份 |

前端没有任何密钥，接口地址固定为同源的 `/api`。

## 本地开发

| 目的 | 做法 |
| --- | --- |
| 启动 | `pnpm dev` 同时启动 Vite（前端）和 `wrangler dev`（Worker + 本地 D1）；Vite 把 `/api`、`/mcp` 代理到 wrangler |
| 建表 | `wrangler d1 migrations apply ai-kit --local` |
| 登录 | `ENVIRONMENT=development` 且设置了 `DEV_AUTH_EMAIL` 时，鉴权中间件直接使用这个身份；生产环境下这条路径不存在 |
| 示例数据 | `pnpm seed` 把 `apps/worker/seed/seed.json` 导入本地库；这个文件由原型的 `prototype/data.js` 转换而来（任务 WP2） |

## 构建与部署

| 流水线 | 触发 | 步骤 |
| --- | --- | --- |
| `ci.yml` | 每次推送和 PR | 安装依赖 → lint → 类型检查 → 单元测试 → Worker 集成测试 → 构建 |
| `deploy.yml` | main 分支 CI 通过后 | 构建前端 → `wrangler d1 migrations apply ai-kit --remote` → `wrangler deploy` |
| `backup.yml` | 每天定时，也可手动 | 见 [06-ops](06-ops.md#备份) |

部署需要的 GitHub Secrets：`CLOUDFLARE_API_TOKEN`（只给 Workers 脚本和 D1 的编辑权限）、`CLOUDFLARE_ACCOUNT_ID`。

迁移先于代码发布，所以迁移只做向后兼容的改动（加表、加可空列、加索引）。删列或改列分两次发布：先让代码不再使用，再删。

## 编码约定

- TypeScript 开启 `strict`；ESLint + Prettier 用默认规则，2 空格缩进。
- 命名：数据库列用 snake_case，TypeScript 和 JSON 用 camelCase，转换只在 `worker/db` 层做。
- 时间一律是 UTC 的 ISO 8601 字符串（`2026-09-29T08:00:00.000Z`），由服务端赋值。
- ID 用 ULID，由服务端生成；离线新建时允许客户端先生成，规则见 [03-api](03-api.md#离线新建)。
- 服务层抛出带 `code`、`status`、`details` 的 `AppError`，由统一中间件转换成 [03-api](03-api.md#错误格式) 的错误格式。
- 日志一行一个 JSON：请求 ID、路由、状态码、耗时、调用者角色。条目内容、请求头、令牌不进日志。
- 测试文件和源码放在一起，命名 `*.test.ts`。
- 界面文案遵循 [04-frontend](04-frontend.md#文案) 的规则。
