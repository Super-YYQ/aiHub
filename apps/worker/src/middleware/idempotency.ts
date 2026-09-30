// 幂等与请求体限制（03-api#约定：Idempotency-Key、请求体上限、离线新建）。
import type { MiddlewareHandler } from 'hono';
import { badRequest, payloadTooLarge } from '../errors';
import type { AuthAppEnv } from '../auth/middleware';

export const BODY_LIMIT = 1024 * 1024; // 1 MB
export const IMPORT_BODY_LIMIT = 10 * 1024 * 1024; // 导入接口 10 MB

/** 请求体上限（content-length 快速路径 + 实际读取兜底）。 */
export function bodyLimit(limit: number): MiddlewareHandler<AuthAppEnv> {
  return async (c, next) => {
    const declared = Number(c.req.header('content-length') ?? 0);
    if (declared > limit) throw payloadTooLarge();
    await next();
  };
}

/** 读 JSON 请求体；解析失败 → 400 bad_request。 */
export async function readJson<T = unknown>(c: {
  req: { json: () => Promise<unknown> };
}): Promise<T> {
  try {
    return (await c.req.json()) as T;
  } catch {
    throw badRequest('请求体不是合法的 JSON。');
  }
}

export interface IdempotencyResult<T> {
  replayed: boolean;
  value: T;
}

/**
 * 幂等执行：同一个 Idempotency-Key 在 24 小时内重复提交，直接返回第一次的响应。
 * 实现按 03-api：键值存 idempotency 表（key → response JSON）。
 */
export async function withIdempotency<T>(
  db: D1Database,
  key: string | undefined,
  run: () => Promise<{ status: number; body: T }>,
): Promise<IdempotencyResult<{ status: number; body: T }>> {
  if (!key) return { replayed: false, value: await run() };

  const existing = await db
    .prepare(`SELECT response FROM idempotency WHERE key = ?`)
    .bind(key)
    .first<{ response: string }>();
  if (existing) {
    return { replayed: true, value: JSON.parse(existing.response) as { status: number; body: T } };
  }

  const result = await run();
  const now = new Date().toISOString();
  await db
    .prepare(`INSERT INTO idempotency (key, response, created_at) VALUES (?, ?, ?)`)
    .bind(key, JSON.stringify(result), now)
    .run();
  return { replayed: false, value: result };
}
