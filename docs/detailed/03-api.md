# 03 接口

实体的字段和约束见 [02-data-model](02-data-model.md)，这里只写接口行为。

## 约定

- 同源路径 `/api`，请求和响应都是 UTF-8 JSON，字段用 camelCase。
- 每个请求都要带合法的 Access JWT，由鉴权中间件校验并解析出调用者角色（见 [05-security](05-security.md#角色与权限)）。下表“角色”列之外的调用一律返回 403。
- 更新和删除条目、环境时必须带 `If-Match: "<version>"`，成功响应带新的 `ETag: "<version>"`。
- 新建类接口接受 `Idempotency-Key` 请求头（客户端生成的 ULID）。同一个键在 24 小时内重复提交，直接返回第一次的响应。
- 请求体上限 1 MB，导入接口 10 MB；列表接口单次最多返回 500 条。

## 错误格式

```json
{ "error": { "code": "validation_failed", "message": "名称不能为空", "details": [{ "path": "title", "issue": "too_small" }] } }
```

`message` 是可以直接展示给用户的中文句子，说明哪里有问题、怎么改。

| HTTP | code | 场景 |
| --- | --- | --- |
| 400 | `bad_request` | JSON 解析失败、参数格式错误 |
| 401 | `unauthenticated` | 缺少或无法验证 Access JWT |
| 403 | `forbidden` | 角色无权调用 |
| 404 | `not_found` | 资源不存在或已删除 |
| 409 | `version_conflict` | `If-Match` 与当前版本不一致，`details.current` 是最新实体 |
| 409 | `slug_taken` | 同类型下标识已被占用 |
| 409 | `in_use` | 删除仍被条目引用的类型或平台 |
| 413 | `payload_too_large` | 超出请求体上限 |
| 422 | `validation_failed` | 字段不满足约束，`details` 逐项列出 |
| 422 | `secret_detected` | 密钥扫描命中，`details` 列出位置和规则名，只含脱敏预览，不回显原文 |
| 428 | `precondition_required` | 需要 `If-Match` 却没有带 |
| 500 | `internal` | 未预期错误，响应里带请求 ID 方便查日志 |

## 角色

`owner` 是本人（浏览器登录）；`agent`、`capture`、`backup`、`scanner` 是服务令牌，映射方式见 [05-security](05-security.md#角色与权限)。

## 条目

| 方法与路径 | 角色 | 说明 |
| --- | --- | --- |
| `GET /api/entries?type=&status=&stack=&q=` | owner、agent | 过滤查询，不含已删除条目；前端日常用同步接口，这个主要给 MCP 用 |
| `GET /api/entries/:id` | owner、agent | 单条，含 `stacks` |
| `POST /api/entries` | owner | 新建，请求体是不含 `version`、时间戳的条目；可带 `id`（见[离线新建](#离线新建)），返回 201 |
| `PUT /api/entries/:id` | owner | 整条替换，需 `If-Match` |
| `PATCH /api/entries/:id` | owner | 只改 `status`、`pinned`、`rating`，给列表和详情里的快捷操作用，需 `If-Match` |
| `DELETE /api/entries/:id` | owner | 软删除，需 `If-Match`，返回 204 |
| `GET /api/entries/:id/revisions` | owner | 修订列表：`version`、`actor`、`createdAt` |
| `GET /api/entries/:id/revisions/:version` | owner | 某个版本的完整快照 |
| `POST /api/entries/:id/restore` | owner | 请求体 `{ "version": 3 }`，用该快照生成一个新版本，需 `If-Match` |
| `POST /api/capture` | owner、agent、capture | 快速记录，见下文 |

**快速记录** 请求体 `{ "type": "mcp", "text": "...", "sourceUrl": "可选", "stackId": "可选" }`，生成一条 `inbox` 状态的条目。转换规则写在 `packages/shared`，与原型一致：

- 整段是一个网址时，标题取“域名 + 路径”，网址存为链接。
- 其他情况，标题取第一行的前 60 个字符。
- 超过 60 个字符的文本：提示词类型存成一个片段，其他类型存进笔记。

## 环境

| 方法与路径 | 角色 | 说明 |
| --- | --- | --- |
| `GET /api/stacks` | owner、agent、scanner | 全部环境，附 `entryCount` |
| `POST /api/stacks` | owner | 新建 |
| `PUT /api/stacks/:id` | owner | 修改名称、类型、系统、说明、排序，需 `If-Match` |
| `DELETE /api/stacks/:id` | owner | 删除环境，只解除成员关系和来源，不删除条目，需 `If-Match` |
| `PUT /api/stacks/:id/entries` | owner | 批量调整成员：`{ "add": [{ "entryId": "...", "note": "" }], "remove": ["entryId"] }` |
| `PATCH /api/stacks/:id/entries/:entryId` | owner | 修改本环境下的备注 `{ "note": "..." }` |
| `GET /api/stacks/:id/checklist` | owner、agent | 安装清单，`text/markdown`；内容是按类型分组的待勾选条目，附各条目标记为“安装命令”的片段 |

成员关系的变化也记为相关条目的变更（条目的 `stacks` 字段变了），这样同步接口只需要推送条目。

## 类型、平台、标签与设置

| 方法与路径 | 角色 | 说明 |
| --- | --- | --- |
| `GET /api/types`、`POST /api/types`、`PUT /api/types/:id`、`DELETE /api/types/:id` | 读：owner、agent；写：owner | 内置类型不能删；仍有条目引用时删除返回 `in_use` |
| `GET /api/platforms` 及对应的增、改、删 | 同上 | 规则同类型 |
| `GET /api/settings/rules` | owner、agent | 读取整理规则 |
| `PUT /api/settings/rules` | owner | `{ "value": "Markdown" }`，保存整理规则 |
| `POST /api/tags/rename` | owner | `{ "from": "旧名", "to": "新名" }`；目标已存在时相当于合并；每个受影响的条目都写修订和变更日志 |

## 同步

`GET /api/sync?since=<seq>&limit=500`，角色 owner。

```json
{
  "entries": [], "stacks": [], "types": [], "platforms": [], "proposals": [],
  "deleted": { "entries": [], "stacks": [], "types": [], "platforms": [] },
  "cursor": 1234,
  "hasMore": false
}
```

- 服务端读取 `change_log` 中 `seq > since` 的行（按 `seq` 升序，最多 `limit` 行），按实体去重后返回每个实体的当前状态；已删除的只返回 ID。
- `cursor` 是本次处理到的最后一个 `seq`，客户端保存下来作为下次的 `since`。`hasMore` 为真时立即再拉一次。
- `since=0` 返回全量，`cursor` 取当前最大 `seq`。
- `proposals` 只包含 `pending` 状态的提案，用来显示“待确认”数量。

## 提案

| 方法与路径 | 角色 | 说明 |
| --- | --- | --- |
| `GET /api/proposals?status=pending` | owner | 列表 |
| `POST /api/proposals` | agent、scanner | 提交提案，`payload` 按条目 schema 校验并做密钥扫描 |
| `POST /api/proposals/:id/accept` | owner | 可带 `{ "payload": {...} }` 表示用户改过的版本；按正常写入规则落库，修订的 `actor` 记为 `owner (proposal <id>)` |
| `POST /api/proposals/:id/reject` | owner | 可带 `{ "reason": "..." }` |
| `POST /api/proposals/bulk` | owner | `{ "ids": [], "action": "accept" \| "reject" }`，逐条返回结果，一条失败不影响其他 |

接受时如果目标条目的版本已经不是 `baseVersion`，返回 `version_conflict`，由界面展示差异后让用户决定。

## 扫描

| 方法与路径 | 角色 | 说明 |
| --- | --- | --- |
| `POST /api/scan-runs` | scanner | `{ "stackId": "...", "scanner": "0.1.0", "items": [ScanItem] }`；服务端计算漂移并生成提案，返回 `{ scanRun, summary, proposalIds }`，规则见 [07](07-mcp-scanner.md#漂移与提案) |
| `GET /api/scan-runs?stackId=` | owner | 扫描历史 |

## 导出、导入与其他

| 方法与路径 | 角色 | 说明 |
| --- | --- | --- |
| `GET /api/export` | owner、backup | 导出 JSON，格式见 [02](02-data-model.md#导出格式) |
| `POST /api/import?mode=replace\|merge\|prototype` | owner | 导入，返回 `{ "imported": 21, "renamed": [] }` |
| `GET /api/me` | 全部 | `{ "kind": "human" \| "service", "email": "...", "role": "owner" }` |
| `GET /api/health` | 全部 | `{ "ok": true, "db": true }` |
| `POST /mcp` | agent | MCP 端点，见 [07](07-mcp-scanner.md#mcp-端点) |

## 冲突

带了过期 `If-Match` 的写请求返回 409 `version_conflict`，`details.current` 是服务端最新版本。前端按 [04-frontend](04-frontend.md#冲突处理) 展示两边差异，由用户选择保留哪边或手工合并，再用最新版本号重新提交。

## 离线新建

离线时前端可以先生成 ULID 作为条目 `id`，并把同一个值作为 `Idempotency-Key`。联网后提交：`id` 合法且不存在就直接使用；已存在且幂等键相同，返回上次的响应；已存在但幂等键不同，返回 409。
