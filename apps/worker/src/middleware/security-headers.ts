import type { MiddlewareHandler } from 'hono';

/**
 * 统一响应安全头（见 docs/detailed/05-security.md#内容安全）。
 * 接口响应由本中间件加；静态资源优先用 _headers，若不支持则由 Worker 兜底。
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

export const securityHeaders = (): MiddlewareHandler => async (c, next) => {
  await next();
  c.header('Content-Security-Policy', CSP);
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
};
