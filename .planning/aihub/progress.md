# 进度

> 实时更新。图例：⬜ 未开始 · 🟡 进行中 · ✅ 完成 · ⏸️ 阻塞(待人工)

## 当前

- 🟡 WP7 共用页面、结构 1 与外观设置

## 明细

| WP      | 状态 | 说明                                                                                 |
| ------- | ---- | ------------------------------------------------------------------------------------ |
| WP0     | ✅   | workspace/lint/typecheck/test/build 全绿；wrangler dev /api/health→{ok:true,db:true} |
| WP1     | ✅   | shared 全量：schema(105 测试)/密钥扫描/搜索/变量/capture/markdown/清单/原型转换 全绿 |
| WP2     | ✅   | 迁移+种子(21/3)+Drizzle 表+迁移测试 6/6；本地库实测 slug 唯一/重用/外键              |
| WP3     | 🟡   | JWT 校验/角色/权限/本地开发身份                                                      |
| WP4     | ✅   | 全部接口实现+验收 15 测试：batch 行数/409/428/422/环境删除保留条目/修订恢复          |
| WP5     | 🟡   | /api/sync、/api/capture（幂等）、/api/export、/api/import 三模式                     |
| WP6     | 🟡   | Vue 骨架、Dexie、同步引擎（outbox/退避/锁/广播）                                     |
| WP7     | 🟡   | 三栏工作台/条目页、共用编辑/环境/设置、命令面板、冲突对话框、三套配色令牌         |
| WP7A-D  | ⬜   |                                                                                      |
| WP8     | ⬜   |                                                                                      |
| WP9     | ⬜   | deploy.yml 可做；实部署待人工                                                        |
| WP10    | ⬜   | tools/backup 可做；凭据/实跑待人工                                                   |
| WP11-15 | ⬜   |                                                                                      |

## 验证记录

（每步记录 lint/typecheck/test/build 结果）

- WP0: pnpm install ✅ / lint ✅(0 err) / typecheck ✅ / test ✅(passWithNoTests) / build ✅(shared tsc+web vite+worker dry-run) / wrangler dev ✅
- WP1: shared test 105/105 ✅（含 hook→Hook、playwright→Playwright MCP、序列化确定性、21 条目/3 环境转换）；typecheck ✅ lint ✅ format ✅ build ✅

## 环境

- Node v24.14.0 / pnpm 11.22.0 / npm 11
- 平台 win32，shell bash
- pnpm install 网络可用（taobao 镜像）；onlyBuiltDependencies 已允许 esbuild/workerd/sharp/vue-demi
- WP2: 迁移测试 6/6 ✅（内置字典/默认规则/slug 唯一/删除后重用/环境名唯一/外键）；本地 D1 实测 seed 21 条目/3 环境/21 成员，重复 seed 不重复插入；typecheck/lint/format 全绿
- WP3: worker 测试 20/20（含迁移 6）✅；鉴权验收全覆盖：缺 JWT/过期/错 aud/坏签名→401，邮箱不在白名单/未知服务令牌→403，backup/capture/agent 表外→403，production+DEV_AUTH_EMAIL 不旁路
- WP4: worker 35/35 ✅（鉴权 14 + 迁移 6 + 条目验收 8 + 字典/标签 7）；stacks 表补 version 列（迁移与 02 文档同步）
- WP5: worker 40/40 ✅；验收全覆盖：since=0 拉全量与 export 一致、增量拿到写入/删除、幂等键两次响应相同且只 1 行、export→replace→export 除 exportedAt 逐字段相同、prototype 导入 21/3；导入补 change_log（修同步可见性）
- WP6: web test 5/5（离线入 outbox→联网顺序上传、409 冲突态保留、422 撤销、BroadcastChannel 刷新、锁降级串行）✅；wrangler dev 实测 /api/health + 前端 + SPA 回退（/stacks→200 html）
