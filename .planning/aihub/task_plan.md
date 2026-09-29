# AI 工作台 — 实现计划

目标：读 docs，从 WP0 起实现仓库全部任务；需人工处理的集中到 `PENDING-MANUAL.md`；实时记录进度；分步 commit。

## 技术栈（据 01-architecture）

pnpm workspace · Vue3+TS+Vite · Hono+Worker · Drizzle+D1 · Zod(shared) · Vitest/@cloudflare/vitest-pool-workers · Playwright · jose

## 工作包与状态（详见 progress.md）

- [ ] WP0 工程骨架
- [ ] WP1 shared 核心库
- [ ] WP2 数据库迁移与种子
- [ ] WP3 鉴权中间件
- [ ] WP4 条目/环境/字典/设置接口
- [ ] WP5 同步/快速记录/导入导出
- [ ] WP6 前端骨架与本地数据层
- [ ] WP7 共用页面+结构1+外观
- [ ] WP7A 卡片墙 / WP7B 搜索优先 / WP7C 看板 / WP7D 知识库
- [ ] WP8 PWA
- [ ] WP9 部署流水线（部署本身→手工）
- [ ] WP10 备份流水线（凭据/实跑→手工）
- [ ] WP11 历史版本界面
- [ ] WP12 字典/标签/规则管理界面
- [ ] WP13 手机快捷指令与分享
- [ ] WP14 提案后端与待确认页
- [ ] WP15 MCP 端点与数据收集规则

## 交付边界

代码/配置/测试/workflow 全部实现并尽力本地验证（lint/typecheck/test/build）。
外部账号、域名、Access、GitHub Secrets、坚果云、age、真实部署、真机、CI 视觉基线 → PENDING-MANUAL.md。

## 提交策略

一个 WP 一次（或多次）commit，信息 `wp<n>: ...`，末尾不加署名（除非系统要求）。
