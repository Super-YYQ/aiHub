# 进度

> 实时更新。图例：⬜ 未开始 · 🟡 进行中 · ✅ 完成 · ⏸️ 阻塞(待人工)

## 当前

- 🟡 WP15 MCP 端点与数据收集规则

## 明细

| WP     | 状态 | 说明                                                                                 |
| ------ | ---- | ------------------------------------------------------------------------------------ |
| WP0    | ✅   | workspace/lint/typecheck/test/build 全绿；wrangler dev /api/health→{ok:true,db:true} |
| WP1    | ✅   | shared 全量：schema(105 测试)/密钥扫描/搜索/变量/capture/markdown/清单/原型转换 全绿 |
| WP2    | ✅   | 迁移+种子(21/3)+Drizzle 表+迁移测试 6/6；本地库实测 slug 唯一/重用/外键              |
| WP3    | 🟡   | JWT 校验/角色/权限/本地开发身份                                                      |
| WP4    | ✅   | 全部接口实现+验收 15 测试：batch 行数/409/428/422/环境删除保留条目/修订恢复          |
| WP5    | 🟡   | /api/sync、/api/capture（幂等）、/api/export、/api/import 三模式                     |
| WP6    | 🟡   | Vue 骨架、Dexie、同步引擎（outbox/退避/锁/广播）                                     |
| WP7    | 🟡   | 三栏工作台/条目页、共用编辑/环境/设置、命令面板、冲突对话框、三套配色令牌            |
| WP7A-D | 🟡   | 卡片墙/搜索优先/看板/知识库                                                          |
| WP8    | 🟡   | manifest、Service Worker、新版本提示、主题色跟随                                     |
| WP9    | 🟡   | deploy.yml 可自动做；建库/域名/Access/Secrets 见 PENDING-MANUAL                      |
| WP10   | ✅   | check-export/to-markdown + backup.yml；5 测试全绿；凭据/实跑见 PENDING-MANUAL        |
| WP11   | ✅   | 抽屉列出修订、选中对比（字段+笔记逐行）、恢复生成新版本且旧版本保留；E2E 全过        |
| WP12   | ✅   | 类型/平台/标签管理已在 WP7 一并实现                                                  |
| WP13   | ✅   | manifest share_target+分享参数预填面板（E2E 双视口）+ iOS 快捷指令文档               |
| WP14   | 🟡   | 四种提案创建/接受/拒绝、过期冲突、批量                                               |
| WP15   | ⬜   | MCP 端点 + 数据收集规则                                                              |

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
- WP7: E2E 16/16 ✅（desktop 1440×900 + mobile 390×844；快速记录/命令面板复制/状态修改/复制MD/变量复制/新建编辑删除/安装清单/环境增删/手机记录面板/筛选/XSS 转义/外观持久化）；关键修复：Vue 响应式对象不能直接进 IndexedDB（plain() 去代理）、seed 需补 change_log、E2E 对构建产物跑（wrangler 直接服务 dist）
- WP7A-D: E2E desktop 14/14、mobile 14/14 全绿；30 种结构×配色×深浅组合工作台+详情打开零控制台报错；看板拖动改状态（dragstart 修复）、知识库目录收起状态不再被 Vue 属性设置误触发（syncClosed 读事件真实状态）、卡片链接层按原型 z 序（链接盖全卡、按钮更高层）
- WP8: PWA E2E 4/4 ✅（manifest 字段/图标/SW 预缓存+断网可开可搜/更新横幅）；SW 兜底仅限导航（JS 失败不返回 HTML 的 MIME 修复）；真机添加主屏见 PENDING-MANUAL
- WP9: deploy.yml（构建→wrangler d1 migrations --remote→wrangler deploy→冒烟）；实际部署步骤全部在 PENDING-MANUAL
- WP10: tools/backup 5 测试全绿（check-export 闸门/schemaVersion/确定性两次逐字节相同/YAML 头+安装命令）；backup.yml 修正步骤顺序（先检出数据仓库再写入）
- WP11: E2E ✅（修改三次→3 旧版本；v1 对比当前含说明/笔记逐行差异；恢复 v3 生成 v5，旧版本仍在，详情显示恢复后内容）
- WP12: 类型/平台/标签管理页验收 E2E ✅（新建类型→条目出现、删除被引用类型提示原因、标签合并、规则保存回读）；关键修复：管理页直接写库后 syncSoon（等在途同步再拉）、删除的 res.ok 检查（409 原因现在能显示）
- WP13: share_target 预填 E2E 双视口 ✅；分享判定改为 url/text（不再被编辑页 ?title= 预填误触发）；iOS 快捷指令配置文档 docs/shortcuts.md
- WP14: worker 49/49（提案 9 个新测试：四 kind 全走通、update 修订 actor=owner (proposal <id>)、过期 409 details.current、批量 49 成功 1 条带原因、owner 提案 403、密钥 422 不回显）✅
- WP14 前端：待确认页按 actor 分组、接受/修改后接受（编辑页载入草稿，保存即接受）/拒绝/多选批量；E2E 3/3（X-Dev-Auth 模拟 agent，仅 development 生效）
- 关键修复：同步始终带 pending 提案（不受分页窗口限制）、本地清已决策提案、分享参数清理不再误删 ?proposal=/?title=
