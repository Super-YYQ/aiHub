import { Hono } from 'hono';
import { securityHeaders } from './middleware/security-headers';
import { authMiddleware, type AuthAppEnv } from './auth/middleware';
import { guardRoute } from './auth/guard';
import { AppError } from './errors';
import {
  bodyLimit,
  readJson,
  withIdempotency,
  BODY_LIMIT,
  IMPORT_BODY_LIMIT,
} from './middleware/idempotency';
import * as entries from './services/entries';
import * as stacks from './services/stacks';
import * as dicts from './services/dictionaries';
import * as settings from './services/settings';
import * as proposals from './services/proposals';
import * as syncService from './services/sync';
import * as captureService from './services/capture';
import * as importExport from './services/import-export';

/**
 * Worker 应用：一个 Hono 实例托管 /api/* 与 /mcp。
 * 其余路径由 Assets（run_worker_first 之外）直接服务，SPA 回退到 index.html。
 * 路由：guardRoute 从 ROUTE_ROLES 取角色表；成功写响应带 ETag（03-api#约定）。
 */
export function createApp() {
  const app = new Hono<{ Bindings: Env } & AuthAppEnv>();

  app.use('*', securityHeaders());

  // 统一错误处理：AppError → 03-api 错误格式；未知错误 → 500 + 请求 ID。
  app.onError((err, c) => {
    const requestId = c.req.header('cf-ray') ?? crypto.randomUUID();
    if (err instanceof AppError) {
      return c.json(
        { error: { code: err.code, message: err.message, details: err.details } },
        err.status as 400,
      );
    }
    console.error(
      JSON.stringify({
        requestId,
        route: c.req.path,
        status: 500,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return c.json(
      { error: { code: 'internal', message: '服务器内部错误', details: [{ requestId }] } },
      500,
    );
  });

  // 健康检查：不需要登录（03-api：全部）
  app.get('/api/health', async (c) => {
    let db = false;
    try {
      await c.env.DB.prepare('SELECT 1').first();
      db = true;
    } catch {
      db = false;
    }
    return c.json({ ok: true, db });
  });

  // 其余 /api/* 都要经过鉴权（登录本身由 Access 负责；Worker 再校验一次 JWT）
  app.use('/api/*', authMiddleware());
  app.use('/api/*', bodyLimit(BODY_LIMIT));

  // 当前身份（03-api：全部角色）
  app.get('/api/me', (c) => {
    const id = c.get('identity');
    return c.json({ kind: id.kind, email: id.email, role: id.role });
  });

  const etag = (e: { version: number }) => `"${e.version}"`;

  // ---------- 条目 ----------
  app.get('/api/entries', guardRoute('GET /api/entries'), async (c) => {
    const list = await entries.listEntries(c.env.DB, {
      type: c.req.query('type'),
      status: c.req.query('status'),
      stack: c.req.query('stack'),
    });
    return c.json(list);
  });

  app.get('/api/entries/:id', guardRoute('GET /api/entries/:id'), async (c) => {
    const entry = await entries.getEntry(c.env.DB, c.req.param('id'));
    if (!entry) throw new AppError('not_found', 404, '条目不存在或已删除');
    return c.json(entry);
  });

  app.post('/api/entries', guardRoute('POST /api/entries'), bodyLimit(BODY_LIMIT), async (c) => {
    const payload = await readJson(c);
    const idempotencyKey = c.req.header('Idempotency-Key');
    // 离线新建：id 合法且不存在则直接使用；已存在且幂等键相同 → 上次的响应（见 withIdempotency）
    const clientEntryId = (payload as { id?: string }).id;
    if (clientEntryId) {
      const existing = await entries.getEntry(c.env.DB, clientEntryId);
      if (existing) {
        if (idempotencyKey) {
          const { replayed, value } = await withIdempotency(c.env.DB, idempotencyKey, async () => ({
            status: 200,
            body: existing,
          }));
          if (replayed || value.status === 200) {
            return c.json(existing, 200, { ETag: etag(existing) });
          }
        }
        throw new AppError('version_conflict', 409, '这个条目 ID 已经存在，且幂等键不匹配。', [
          { issue: 'id_taken', current: existing },
        ]);
      }
    }
    const { value } = await withIdempotency(c.env.DB, idempotencyKey, async () => {
      const entry = await entries.createEntry(c.env.DB, payload, { id: clientEntryId });
      return { status: 201, body: entry } as { status: 201; body: typeof entry };
    });
    return c.json(value.body, 201, { ETag: etag(value.body as { version: number }) });
  });

  app.put('/api/entries/:id', guardRoute('PUT /api/entries/:id'), async (c) => {
    const entry = await entries.updateEntry(
      c.env.DB,
      c.req.param('id'),
      c.req.header('If-Match'),
      await readJson(c),
      c.get('identity').actor,
    );
    return c.json(entry, 200, { ETag: etag(entry) });
  });

  app.patch('/api/entries/:id', guardRoute('PATCH /api/entries/:id'), async (c) => {
    const entry = await entries.patchEntry(
      c.env.DB,
      c.req.param('id'),
      c.req.header('If-Match'),
      await readJson(c),
      c.get('identity').actor,
    );
    return c.json(entry, 200, { ETag: etag(entry) });
  });

  app.delete('/api/entries/:id', guardRoute('DELETE /api/entries/:id'), async (c) => {
    await entries.deleteEntry(
      c.env.DB,
      c.req.param('id'),
      c.req.header('If-Match'),
      c.get('identity').actor,
    );
    return c.body(null, 204);
  });

  app.get('/api/entries/:id/revisions', guardRoute('GET /api/entries/:id/revisions'), async (c) => {
    const list = await entries.listRevisions(c.env.DB, c.req.param('id'));
    return c.json(list);
  });

  app.get(
    '/api/entries/:id/revisions/:version',
    guardRoute('GET /api/entries/:id/revisions/:version'),
    async (c) => {
      const snapshot = await entries.getRevision(
        c.env.DB,
        c.req.param('id'),
        Number(c.req.param('version')),
      );
      return c.json(snapshot);
    },
  );

  app.post('/api/entries/:id/restore', guardRoute('POST /api/entries/:id/restore'), async (c) => {
    const body = await readJson<{ version?: number }>(c);
    if (typeof body.version !== 'number')
      throw new AppError('bad_request', 400, '请求体需要是 { "version": 数字 }');
    const entry = await entries.restoreEntry(
      c.env.DB,
      c.req.param('id'),
      c.req.header('If-Match'),
      body.version,
      c.get('identity').actor,
    );
    return c.json(entry, 200, { ETag: etag(entry) });
  });

  // ---------- 环境 ----------
  app.get('/api/stacks', guardRoute('GET /api/stacks'), async (c) =>
    c.json(await stacks.listStacks(c.env.DB)),
  );

  app.post('/api/stacks', guardRoute('POST /api/stacks'), async (c) => {
    const stack = await stacks.createStack(c.env.DB, await readJson(c));
    return c.json(stack, 201, { ETag: etag(stack) });
  });

  app.put('/api/stacks/:id', guardRoute('PUT /api/stacks/:id'), async (c) => {
    const stack = await stacks.updateStack(
      c.env.DB,
      c.req.param('id'),
      c.req.header('If-Match'),
      await readJson(c),
    );
    return c.json(stack, 200, { ETag: etag(stack) });
  });

  app.delete('/api/stacks/:id', guardRoute('DELETE /api/stacks/:id'), async (c) => {
    await stacks.deleteStack(c.env.DB, c.req.param('id'), c.req.header('If-Match'));
    return c.body(null, 204);
  });

  app.put('/api/stacks/:id/entries', guardRoute('PUT /api/stacks/:id/entries'), async (c) => {
    await stacks.updateStackEntries(c.env.DB, c.req.param('id'), await readJson(c));
    const stack = await stacks.getStack(c.env.DB, c.req.param('id'));
    return c.json(stack);
  });

  app.patch(
    '/api/stacks/:id/entries/:entryId',
    guardRoute('PATCH /api/stacks/:id/entries/:entryId'),
    async (c) => {
      await stacks.setStackEntryNote(
        c.env.DB,
        c.req.param('id'),
        c.req.param('entryId'),
        await readJson(c),
      );
      return c.json(await stacks.getStack(c.env.DB, c.req.param('id')));
    },
  );

  app.get('/api/stacks/:id/checklist', guardRoute('GET /api/stacks/:id/checklist'), async (c) => {
    const { buildChecklist } = await import('@aikit/shared');
    const { stack, entries: members } = await stacks.stackMembers(c.env.DB, c.req.param('id'));
    const types = await dicts.listTypes(c.env.DB);
    const typeName = (id: string) => types.find((t) => t.id === id)?.name ?? id;
    const typeOrder = Object.fromEntries(types.map((t) => [t.id, t.sort]));
    const md = buildChecklist(stack.name, members, { typeName, typeOrder });
    return c.text(md, 200, { 'content-type': 'text/markdown; charset=utf-8' });
  });

  // ---------- 类型 / 平台 ----------
  app.get('/api/types', guardRoute('GET /api/types'), async (c) =>
    c.json(await dicts.listTypes(c.env.DB)),
  );
  app.post('/api/types', guardRoute('POST /api/types'), async (c) => {
    const body = await readJson<{ id?: string }>(c);
    if (!body.id) throw new AppError('bad_request', 400, '需要在请求体里提供 id');
    const type = await dicts.createType(c.env.DB, body.id, body);
    return c.json(type, 201);
  });
  app.put('/api/types/:id', guardRoute('PUT /api/types/:id'), async (c) =>
    c.json(await dicts.updateType(c.env.DB, c.req.param('id'), await readJson(c))),
  );
  app.delete('/api/types/:id', guardRoute('DELETE /api/types/:id'), async (c) => {
    await dicts.deleteType(c.env.DB, c.req.param('id'));
    return c.body(null, 204);
  });

  app.get('/api/platforms', guardRoute('GET /api/platforms'), async (c) =>
    c.json(await dicts.listPlatforms(c.env.DB)),
  );
  app.post('/api/platforms', guardRoute('POST /api/platforms'), async (c) => {
    const body = await readJson<{ id?: string }>(c);
    if (!body.id) throw new AppError('bad_request', 400, '需要在请求体里提供 id');
    const platform = await dicts.createPlatform(c.env.DB, body.id, body);
    return c.json(platform, 201);
  });
  app.put('/api/platforms/:id', guardRoute('PUT /api/platforms/:id'), async (c) =>
    c.json(await dicts.updatePlatform(c.env.DB, c.req.param('id'), await readJson(c))),
  );
  app.delete('/api/platforms/:id', guardRoute('DELETE /api/platforms/:id'), async (c) => {
    await dicts.deletePlatform(c.env.DB, c.req.param('id'));
    return c.body(null, 204);
  });

  // ---------- 设置与标签 ----------
  app.get('/api/settings/rules', guardRoute('GET /api/settings/rules'), async (c) =>
    c.json({ value: await settings.getRules(c.env.DB) }),
  );
  app.put('/api/settings/rules', guardRoute('PUT /api/settings/rules'), async (c) => {
    const value = await settings.putRules(c.env.DB, await readJson(c));
    return c.json({ value });
  });
  app.post('/api/tags/rename', guardRoute('POST /api/tags/rename'), async (c) =>
    c.json(await settings.renameTag(c.env.DB, await readJson(c), c.get('identity').actor)),
  );

  // ---------- 快速记录（幂等）----------
  app.post('/api/capture', guardRoute('POST /api/capture'), async (c) => {
    const payload = await readJson(c);
    const key = c.req.header('Idempotency-Key');
    const { value } = await withIdempotency(c.env.DB, key, async () => {
      const entry = await captureService.capture(c.env.DB, payload);
      return { status: 201, body: entry } as { status: 201; body: typeof entry };
    });
    return c.json(value.body, 201, { ETag: `"${(value.body as { version: number }).version}"` });
  });

  // ---------- 同步 ----------
  app.get('/api/sync', guardRoute('GET /api/sync'), async (c) => {
    const since = Number(c.req.query('since') ?? 0);
    const limit = Number(c.req.query('limit') ?? 500);
    if (!Number.isFinite(since) || since < 0)
      throw new AppError('bad_request', 400, 'since 需要是非负整数。');
    return c.json(await syncService.sync(c.env.DB, since, limit));
  });

  // ---------- 导出 / 导入 ----------
  app.get('/api/export', guardRoute('GET /api/export'), async (c) =>
    c.json(await importExport.exportAll(c.env.DB)),
  );

  app.post(
    '/api/import',
    guardRoute('POST /api/import'),
    bodyLimit(IMPORT_BODY_LIMIT),
    async (c) => {
      const mode = c.req.query('mode');
      if (mode !== 'replace' && mode !== 'merge' && mode !== 'prototype')
        throw new AppError('bad_request', 400, 'mode 需要是 replace、merge 或 prototype。');
      const result = await importExport.importData(c.env.DB, mode, await readJson(c));
      return c.json(result);
    },
  );

  // ---------- 提案（03-api#提案）----------
  app.get('/api/proposals', guardRoute('GET /api/proposals'), async (c) => {
    const status = c.req.query('status') ?? undefined;
    return c.json(await proposals.listProposals(c.env.DB, status));
  });

  app.post('/api/proposals', guardRoute('POST /api/proposals'), async (c) => {
    const identity = c.get('identity');
    const result = await proposals.createProposal(c.env.DB, await readJson(c), identity.actor);
    return c.json(result, 201);
  });

  app.post('/api/proposals/:id/accept', guardRoute('POST /api/proposals/:id/accept'), async (c) => {
    const body = await readJson<{ payload?: unknown }>(c).catch(() => ({ payload: undefined }));
    const identity = c.get('identity');
    const result = await proposals.acceptProposal(
      c.env.DB,
      c.req.param('id'),
      identity.actor,
      body?.payload,
    );
    return c.json(result);
  });

  app.post('/api/proposals/:id/reject', guardRoute('POST /api/proposals/:id/reject'), async (c) => {
    const body = await readJson<{ reason?: string }>(c).catch(() => ({ reason: undefined }));
    const identity = c.get('identity');
    await proposals.rejectProposal(c.env.DB, c.req.param('id'), body?.reason, identity.actor);
    return c.json({ ok: true });
  });

  app.post('/api/proposals/bulk', guardRoute('POST /api/proposals/bulk'), async (c) => {
    const body = await readJson<{ ids?: string[]; action?: string }>(c);
    if (!Array.isArray(body.ids) || !body.ids.length)
      throw new AppError('bad_request', 400, 'ids 需要是非空数组。');
    if (body.action !== 'accept' && body.action !== 'reject')
      throw new AppError('bad_request', 400, 'action 需要是 accept 或 reject。');
    const identity = c.get('identity');
    return c.json(await proposals.bulkProposals(c.env.DB, body.ids, body.action, identity.actor));
  });

  // 未匹配路径：/api 与 /mcp 返回 JSON 404；其余交给静态资源（兜底，正常由 Assets 处理）
  app.notFound((c) => {
    const path = new URL(c.req.url).pathname;
    if (path.startsWith('/api') || path === '/mcp' || path.startsWith('/mcp/')) {
      return c.json({ error: { code: 'not_found', message: '资源不存在或已删除' } }, 404);
    }
    return c.env.ASSETS.fetch(c.req.raw);
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
