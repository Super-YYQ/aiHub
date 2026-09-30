// API 客户端：同源 /api；带 If-Match/Idempotency-Key；错误统一解析（03-api 错误格式）。
export interface ApiErrorBody {
  error: { code: string; message: string; details?: Array<Record<string, unknown>> };
}

export class ApiError extends Error {
  code: string;
  status: number;
  details: Array<Record<string, unknown>>;
  constructor(status: number, body: ApiErrorBody['error']) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.details = body.details ?? [];
  }
}

async function request<T>(
  method: string,
  path: string,
  opts: { body?: unknown; ifMatch?: string; idempotencyKey?: string; raw?: boolean } = {},
): Promise<{ data: T; etag: string | null; status: number; response: Response }> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (opts.ifMatch !== undefined) headers['If-Match'] = opts.ifMatch;
  if (opts.idempotencyKey !== undefined) headers['Idempotency-Key'] = opts.idempotencyKey;

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    let body: ApiErrorBody['error'] | null = null;
    try {
      body = ((await res.json()) as ApiErrorBody).error;
    } catch {
      body = null;
    }
    throw new ApiError(
      res.status,
      body ?? { code: 'unknown', message: `请求失败（${res.status}）` },
    );
  }
  const etag = res.headers.get('ETag');
  if (opts.raw) return { data: (await res.text()) as T, etag, status: res.status, response: res };
  return { data: (await res.json()) as T, etag, status: res.status, response: res };
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path).then((r) => r.data),
  getRaw: (path: string) => request<string>('GET', path, { raw: true }).then((r) => r.data),
  post: <T>(path: string, body?: unknown, idempotencyKey?: string) =>
    request<T>('POST', path, { body, idempotencyKey }),
  put: <T>(path: string, body: unknown, ifMatch?: string) =>
    request<T>('PUT', path, { body, ifMatch }),
  patch: <T>(path: string, body: unknown, ifMatch?: string) =>
    request<T>('PATCH', path, { body, ifMatch }),
  delete: (path: string, ifMatch?: string) =>
    request<null>('DELETE', path, { ifMatch }).then((r) => r.data),

  // 便捷方法（类型见 @aikit/shared）
  me: () => api.get<{ kind: string; email: string | null; role: string }>('/me'),
  health: () => api.get<{ ok: boolean; db: boolean }>('/health'),
  getRules: () => api.get<{ value: string }>('/settings/rules').then((r) => r.value),
};
