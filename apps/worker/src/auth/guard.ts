// 按路由的权限检查：requireRoles 挂在每个路由上（05-security#角色与权限）。
// ROUTE_ROLES 是 03-api 各表“角色”列的唯一出处；路由定义处引用它，避免两处漂移。
import type { MiddlewareHandler } from 'hono';
import { forbidden } from '../errors';
import type { Role } from './identity';
import { ROUTE_ROLES } from './identity';
import type { AuthAppEnv } from './middleware';

/** 生成按角色拦截的中间件：identity 的角色不在列表里 → 403。 */
export function requireRoles(...roles: Role[]): MiddlewareHandler<AuthAppEnv> {
  return async (c, next) => {
    const identity = c.get('identity');
    if (!identity || !roles.includes(identity.role)) throw forbidden();
    await next();
  };
}

/** 从角色表取一个路由的角色列表，生成它的守卫中间件。 */
export function guardRoute(route: string): MiddlewareHandler<AuthAppEnv> {
  const roles = ROUTE_ROLES[route];
  if (!roles) throw new Error(`角色表里没有这个路由：${route}`);
  return requireRoles(...roles);
}
