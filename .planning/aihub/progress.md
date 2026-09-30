# 进度

> 实时更新。图例：⬜ 未开始 · 🟡 进行中 · ✅ 完成 · ⏸️ 阻塞(待人工)

## 当前

- 🟡 WP3 鉴权中间件

## 明细

| WP      | 状态 | 说明                                                                                 |
| ------- | ---- | ------------------------------------------------------------------------------------ |
| WP0     | ✅   | workspace/lint/typecheck/test/build 全绿；wrangler dev /api/health→{ok:true,db:true} |
| WP1     | ✅   | shared 全量：schema(105 测试)/密钥扫描/搜索/变量/capture/markdown/清单/原型转换 全绿 |
| WP2     | ✅   | 迁移+种子(21/3)+Drizzle 表+迁移测试 6/6；本地库实测 slug 唯一/重用/外键             |
| WP3     | 🟡   | JWT 校验/角色/权限/本地开发身份                                                     |
| WP4     | ⬜   |                                                                                      |
| WP5     | ⬜   |                                                                                      |
| WP6     | ⬜   |                                                                                      |
| WP7     | ⬜   |                                                                                      |
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
