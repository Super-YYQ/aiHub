# 文档索引

先读 [总体设计](DESIGN.md) 了解目标和架构，再按任务读下面的详细设计。每条信息只在一个文档里写，其他文档用链接引用。

| 文档 | 内容 | 什么时候读 |
| --- | --- | --- |
| [DESIGN.md](DESIGN.md) | 目标、原则、资源分工、方案选择、总体架构、路线图 | 第一次接触项目 |
| [detailed/01-architecture.md](detailed/01-architecture.md) | 仓库结构、模块职责、配置项、本地开发、构建部署、编码约定 | 动手写任何代码之前 |
| [detailed/02-data-model.md](detailed/02-data-model.md) | 实体、字段约束、D1 表结构、变更日志、导出格式、迁移 | 改数据库、接口字段或导入导出 |
| [detailed/03-api.md](detailed/03-api.md) | 接口约定、全部端点、同步协议、冲突处理、错误码 | 写或调用后端接口 |
| [detailed/04-frontend.md](detailed/04-frontend.md) | 路由、页面规格、组件、状态与离线同步、搜索、快捷键、PWA | 写前端 |
| [detailed/05-security.md](detailed/05-security.md) | Access、JWT 校验、角色、密钥扫描、内容安全 | 碰到鉴权、密钥、渲染用户内容 |
| [detailed/06-ops.md](detailed/06-ops.md) | 部署手册、备份与恢复、监控、额度、Oracle 用法 | 部署、备份、排查线上问题 |
| [detailed/07-mcp-scanner.md](detailed/07-mcp-scanner.md) | MCP 工具定义、提案机制、整理规则、本机扫描器 | 做 AI 接入或扫描器 |
| [detailed/08-ui-spec.md](detailed/08-ui-spec.md) | 五种界面结构、三套配色、组件视觉、动效、手机交互 | 做界面样式或动效 |
| [detailed/09-tasks.md](detailed/09-tasks.md) | 开发任务拆分、依赖、验收标准 | 领取开发任务 |

可交互原型在 [`../prototype/`](../prototype/)，五种结构和三套配色的截图在 [`ui/`](ui/)。原型是界面和交互的参考实现，正式版代码不直接复用它。

## 术语

全部文档、代码和界面文案统一用这些词。

| 术语 | 英文标识 | 含义 |
| --- | --- | --- |
| 条目 | entry | 档案里的一条记录，属于某个类型 |
| 类型 | type | 工具、提示词、Skill、MCP、Hook、插件、配置、模型与 API；可在设置里增加 |
| 片段 | snippet | 条目里可一键复制的最小单元；可标记为“安装命令” |
| 变量 | variable | 片段里的 `{{名称}}`，复制前填写 |
| 环境 | stack | 一台机器或一个使用场景用到的条目集合，用户可自定义 |
| 待整理 | inbox | 状态之一：先记下、还没补全的条目 |
| 提案 | proposal | AI 或扫描器提出的新增或修改，用户确认后才写入档案 |
| 来源 | source | 条目与本机某个配置项的对应关系，由扫描器维护 |
| 漂移 | drift | 档案记录与机器实际配置不一致：新增、缺失或变更 |
| 脱敏 | redaction | 把密钥等敏感值替换成占位符，只保留变量名 |

## 已确认的决定（2026-09-29）

| 事项 | 决定 |
| --- | --- |
| 前端框架 | Vue 3 + TypeScript + Vite，理由见 [01-architecture](detailed/01-architecture.md#技术选型) |
| Oracle 服务器 | Always Free 实例，不放在主链路上，用法见 [06-ops](detailed/06-ops.md#oracle-服务器) |
| 域名 | 部署时再定子域名；代码里只通过配置项引用，不写死 |
| 公开分享 | 不做 |
| 环境 | 用户可新建、编辑、删除，并能批量加入或移出条目 |
| 界面结构 | 五种全部实现（1 三栏、2 卡片墙、3 搜索优先、4 看板、5 知识库），用户随时切换，按设备保存；默认 1 三栏，见 [08-ui-spec](detailed/08-ui-spec.md#界面结构) |
| 配色 | 三套全部实现（A 柔和、B 沉静、C 夜航），随时切换，按设备保存；默认 B 沉静，深浅色跟随系统，见 [08-ui-spec](detailed/08-ui-spec.md#配色方案) |
