// 统一业务错误：code + status + details，由中间件转成 03-api#错误格式。
export type ErrorDetails = Array<Record<string, unknown>>;

export class AppError extends Error {
  code: string;
  status: number;
  details: ErrorDetails;

  constructor(code: string, status: number, message: string, details: ErrorDetails = []) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: ErrorDetails) =>
  new AppError('bad_request', 400, message, details);
export const unauthenticated = (message = '缺少或无法验证登录凭证') =>
  new AppError('unauthenticated', 401, message);
export const forbidden = (message = '没有权限执行这个操作') =>
  new AppError('forbidden', 403, message);
export const notFound = (message = '资源不存在或已删除') => new AppError('not_found', 404, message);
export const versionConflict = (current: unknown) =>
  new AppError('version_conflict', 409, '内容已被其他设备修改', [
    { issue: 'version_mismatch', current },
  ]);
export const slugTaken = (slug: string) =>
  new AppError('slug_taken', 409, `标识“${slug}”在这个类型下已被占用`, [
    { issue: 'slug_taken', slug },
  ]);
export const inUse = (message: string) => new AppError('in_use', 409, message);
export const payloadTooLarge = (message = '请求体超出大小限制') =>
  new AppError('payload_too_large', 413, message);
export const validationFailed = (message: string, details: ErrorDetails) =>
  new AppError('validation_failed', 422, message, details);
export const secretDetected = (
  findings: Array<{ path: string; ruleId: string; preview: string }>,
) =>
  new AppError(
    'secret_detected',
    422,
    '内容里疑似包含密钥，请改成 ${环境变量名} 这样的占位符',
    findings.map((f) => ({ path: f.path, rule: f.ruleId, preview: f.preview, issue: 'secret' })),
  );
export const preconditionRequired = (message = '需要带 If-Match 请求头') =>
  new AppError('precondition_required', 428, message);
export const internal = (message = '服务器内部错误') => new AppError('internal', 500, message);
