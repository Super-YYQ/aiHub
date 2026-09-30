import { Hono } from 'hono';
import { securityHeaders } from './middleware/security-headers';
import { authMiddleware, type AuthAppEnv } from './auth/middleware';
import { guardRoute } from './auth/guard';
import { AppError } from './errors';

export type AppEnv = AuthAppEnv;

/**
 * Worker 应用：一个 Hono 实例托管 /api/* 与 /mcp。
 * 其余路径由 Assets（run_worker_first 之外）直接服务，SPA 回退到 index.html。
 */
export function createApp() {
  const app = new Hono<{ Bindings: Env } & AppEnv>();

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

  // 当前身份（03-api：全部角色）
  app.get('/api/me', (c) => {
    const id = c.get('identity');
    return c.json({ kind: id.kind, email: id.email, role: id.role });
  });

  // 业务路由（WP4 起逐个实现）：先挂上角色守卫，接口体返回 501。
  registerStubRoutes(app);

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

/**
 * 把 ROUTE_ROLES 里的全部路由挂到 app 上：角色守卫先行，handler 暂为 501。
 * WP4/WP5 实现各接口时把 501 handler 替换为真实实现，守卫保持不变。
 */
function registerStubRoutes(app: Hono<{ Bindings: Env } & AppEnv>) {
  const stub = (c: { json: (body: unknown, status?: number) => Response }) =>
    c.json({ error: { code: 'not_implemented', message: '这个接口还没有实现' } }, 501);

  const define = (method: 'get' | 'post' | 'put' | 'patch' | 'delete', route: string) => {
    const key = `${method.toUpperCase()} ${route}`;
    app.on(method, route, guardRoute(key), (c) => stub(c));
  };

  define('get', '/api/entries');
  define('get', '/api/entries/:id');
  define('post', '/api/entries');
  define('put', '/api/entries/:id');
  define('patch', '/api/entries/:id');
  define('delete', '/api/entries/:id');
  define('get', '/api/entries/:id/revisions');
  define('get', '/api/entries/:id/revisions/:version');
  define('post', '/api/entries/:id/restore');
  define('post', '/api/capture');
  define('get', '/api/stacks');
  define('post', '/api/stacks');
  define('put', '/api/stacks/:id');
  define('delete', '/api/stacks/:id');
  define('put', '/api/stacks/:id/entries');
  define('patch', '/api/stacks/:id/entries/:entryId');
  define('get', '/api/stacks/:id/checklist');
  define('get', '/api/types');
  define('post', '/api/types');
  define('put', '/api/types/:id');
  define('delete', '/api/types/:id');
  define('get', '/api/platforms');
  define('post', '/api/platforms');
  define('put', '/api/platforms/:id');
  define('delete', '/api/platforms/:id');
  define('get', '/api/settings/rules');
  define('put', '/api/settings/rules');
  define('post', '/api/tags/rename');
  define('get', '/api/sync');
  define('get', '/api/proposals');
  define('post', '/api/proposals');
  define('post', '/api/proposals/:id/accept');
  define('post', '/api/proposals/:id/reject');
  define('post', '/api/proposals/bulk');
  define('get', '/api/export');
  define('post', '/api/import');
}

export type App = ReturnType<typeof createApp>;
