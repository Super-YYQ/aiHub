# AI 工作台

一份私人档案，用来记录和查看自己的 AI 工作环境：工具、提示词、Skill、MCP、Hook、插件和配置。电脑和手机都能查，能一键复制，能随手补充；以后 AI 代理也能读取它，并按数据收集规则说明帮忙收集和整理。

当前阶段：MVP 与阶段 2、3 的全部工作包（WP0–WP15）已实现；剩余为部署上线等需要账号/真机的事项，见 [`PENDING-MANUAL.md`](PENDING-MANUAL.md)。

## 目录

| 路径 | 内容 |
| --- | --- |
| [`docs/README.md`](docs/README.md) | 文档索引、术语表、已确认的决定 |
| [`docs/DESIGN.md`](docs/DESIGN.md) | 总体设计：目标、资源分工、方案选择、架构、路线图 |
| [`docs/detailed/`](docs/detailed/) | 详细设计：架构、数据模型、接口、前端、安全、运维、AI 接入与数据收集规则、界面规范、开发任务 |
| [`docs/ui/`](docs/ui/) | 五种界面结构和三套配色的截图 |
| [`prototype/`](prototype/) | 可交互原型，纯 HTML、CSS、JavaScript，没有依赖，不需要构建 |
| `apps/web` | 前端：Vue 3 + TypeScript + Vite（Dexie 离线缓存、五种结构、三套配色、PWA） |
| `apps/worker` | 后端：Cloudflare Worker + Hono + Drizzle（D1、鉴权、同步、提案、MCP 端点） |
| `packages/shared` | 前后端共用：Zod schema、密钥扫描、搜索、Markdown 序列化 |
| `tools/backup` | 备份转换：导出 JSON → Markdown 目录（check-export / to-markdown） |
| [`PENDING-MANUAL.md`](PENDING-MANUAL.md) | 需要账号/真机/凭据的待办：部署、备份、真机验证、MCP 接入 |

## 打开原型

用 Edge 或 Chrome 直接打开 `prototype/index.html`（双击即可）。

- **切换外观**：右下角的切换条（手机上在底部导航上方）有两个下拉框：“结构”在 1 三栏、2 卡片墙、3 搜索优先、4 看板、5 知识库之间切换，“配色”在 A 柔和、B 沉静、C 夜航之间切换，月亮按钮切换深浅色。也可以在“数据与设置”里切换，在命令面板里输入“看板”“夜航”等名称也能直接切换，或在地址栏加 `?layout=board&style=soft&theme=dark` 这样的参数。
- **工作台**：快速记录（存入“待整理”），查看置顶、最近更新、各类型数量、待整理、试用中与想试。
- **条目**：按类型、状态、平台、标签筛选；详情页可以切换状态、置顶、复制片段、复制为 Markdown。桌面端切换条目时只更新右侧详情。
- **提示词变量**：片段里的 `{{变量}}` 会生成输入框，填好后复制的是替换后的文本。
- **新建、编辑、删除条目**：片段可以标记为“安装命令”。
- **环境**：可以新建、编辑、删除环境（类型、系统、说明），从档案里挑选条目加入或移出，并生成可勾选的安装清单。
- **搜索面板**：`Ctrl K` 或 `/` 打开，`Enter` 打开条目，`Ctrl Enter` 直接复制第一个片段，`Esc` 关闭。其他页面按 `n` 新建条目。
- **手机**：窄屏下是手机布局；底部导航中间的“记录”按钮从底部弹出记录面板。
- **数据与设置**：导出或导入 JSON、导出全部为 Markdown、恢复示例数据。

## 数据说明

- 原型的数据只存在当前浏览器的 localStorage 里，清除浏览器数据就会丢失。录入真实内容后，请定期在“数据与设置”里导出 JSON；正式版支持导入这个文件。
- 示例数据里的插件名和市场名取自本机 `~/.claude/plugins`，其余条目是演示用的示例。示例数据不含任何密钥。

## 本地开发

```bash
pnpm install
pnpm --filter @aikit/worker run migrate:local   # 本地 D1 建表
pnpm seed                                       # 导入 21 条示例数据
pnpm dev                                        # Vite(5173) + wrangler dev(8787)
```

登录：`apps/worker/.dev.vars`（不提交）写 `DEV_AUTH_EMAIL=你的邮箱`，本地即以这个身份使用。

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build   # 全部检查
pnpm --filter @aikit/web exec playwright test             # 端到端（会自动起本地 Worker）
```

## 下一步

按 [PENDING-MANUAL.md](PENDING-MANUAL.md) 完成部署上线与真机验证。开发任务（[WP0–WP15](docs/detailed/09-tasks.md)）已全部实现。
