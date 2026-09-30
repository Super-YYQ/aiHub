import { Hono } from 'hono';
import { securityHeaders } from './middleware/security-headers';

/** Env 是 wrangler types 生成的全局接口（worker-configuration.d.ts）。 */

/**
 * Worker 应用：一个 Hono 实例托管 /api/* 与 /mcp。
 * 其余路径由 Assets（run_worker_first 之外）直接服务，SPA 回退到 index.html。
 */
export function createApp() {
  const app = new Hono<{ Bindings: Env }>();

  app.use('*', securityHeaders());

  // 健康检查：任何角色可用（见 docs/detailed/03-api.md）
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
