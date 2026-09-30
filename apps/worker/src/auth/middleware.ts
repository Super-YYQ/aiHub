// JWT 校验中间件（见 docs/detailed/05-security.md#jwt-校验）。
// 1. 读 Cf-Access-Jwt-Assertion；没有 → 401。
// 2. jose 校验：签名、issuer、audience、过期（JWKSet 在模块作用域缓存）。
// 3. 识别人（email 白名单 → owner）或服务令牌（common_name → SERVICE_TOKEN_ROLES）。
// 4. { kind, email, role, actor } 放进上下文。
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { MiddlewareHandler } from 'hono';
import { unauthenticated, forbidden } from '../errors';
import type { Identity, Role } from './identity';

// 模块作用域缓存 JWK Set：每个 Access 团队域名一份（文档要求复用以便缓存）。
const jwkSets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
function jwkSetFor(teamDomain: string) {
  let set = jwkSets.get(teamDomain);
  if (!set) {
    set = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
    jwkSets.set(teamDomain, set);
  }
  return set;
}

function parseServiceTokenRoles(raw: string): Map<string, Role> {
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    const map = new Map<string, Role>();
    for (const [id, role] of Object.entries(parsed)) {
      if (['owner', 'agent', 'capture', 'backup'].includes(role)) map.set(id, role as Role);
    }
    return map;
  } catch {
    return new Map();
  }
}

function parseAllowedEmails(raw: string): Set<string> {
  return new Set(
    raw
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** 开发旁路只在 development 且设置了 DEV_AUTH_EMAIL 时存在；生产环境永远走 JWT。 */
export function devBypassEnabled(env: { ENVIRONMENT: string; DEV_AUTH_EMAIL?: string }): boolean {
  return env.ENVIRONMENT === 'development' && Boolean(env.DEV_AUTH_EMAIL);
}

export interface AuthVariables {
  identity: Identity;
}

/** 中间件的环境类型：Bindings 是 wrangler 生成的全局 Env（含 DEV_AUTH_EMAIL 可选字段）。 */
export interface AuthEnv extends Env {
  DEV_AUTH_EMAIL?: string;
}

export type AuthAppEnv = { Bindings: AuthEnv; Variables: AuthVariables };

export function authMiddleware(): MiddlewareHandler<{
  Bindings: AuthEnv;
  Variables: AuthVariables;
}> {
  return async (c, next) => {
    const env = c.env;

    if (devBypassEnabled(env)) {
      // 本地开发身份：DEV_AUTH_EMAIL 支持 "email:role"（如 agent@x:agent），
      // 请求头 X-Dev-Auth（email:role）可按请求覆盖，便于本地/E2E 模拟不同角色；
      // 生产环境没有这条路径（devBypassEnabled 只在 development 为真）。
      const devAuth = c.req.header('X-Dev-Auth') ?? env.DEV_AUTH_EMAIL!;
      const [email, role = 'owner'] = devAuth.split(':');
      const allowedRole = (['owner', 'agent', 'capture', 'backup'] as const).includes(
        role as 'owner',
      )
        ? (role as 'owner')
        : 'owner';
      c.set('identity', {
        kind: 'human',
        email,
        role: allowedRole,
        actor: email,
      });
      await next();
      return;
    }

    const token = c.req.header('Cf-Access-Jwt-Assertion');
    if (!token) throw unauthenticated();

    const teamDomain = env.ACCESS_TEAM_DOMAIN;
    const aud = env.ACCESS_AUD;
    if (!teamDomain || !aud) throw unauthenticated('服务端未配置 Access，拒绝请求');

    let payload: Record<string, unknown>;
    try {
      const { payload: p } = await jwtVerify(token, jwkSetFor(teamDomain), {
        issuer: teamDomain,
        audience: aud,
      });
      payload = p as Record<string, unknown>;
    } catch {
      throw unauthenticated();
    }

    const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : null;
    if (email) {
      const allowed = parseAllowedEmails(env.ALLOWED_EMAILS);
      if (!allowed.has(email)) throw forbidden('这个邮箱不在允许名单里');
      c.set('identity', { kind: 'human', email, role: 'owner', actor: email });
      await next();
      return;
    }

    // 服务令牌：标识声明预期为 common_name（Client ID）
    const clientId = typeof payload.common_name === 'string' ? payload.common_name : null;
    if (clientId) {
      const roles = parseServiceTokenRoles(env.SERVICE_TOKEN_ROLES);
      const role = roles.get(clientId);
      if (!role) throw forbidden('这个服务令牌没有被授权');
      c.set('identity', { kind: 'service', email: null, role, actor: `service:${clientId}` });
      await next();
      return;
    }

    throw forbidden();
  };
}
