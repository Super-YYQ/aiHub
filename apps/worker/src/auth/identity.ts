// 调用者身份与角色（见 docs/detailed/05-security.md#角色与权限）。
export type Role = 'owner' | 'agent' | 'capture' | 'backup';
export const ALL_ROLES: Role[] = ['owner', 'agent', 'capture', 'backup'];

/** 放进请求上下文的身份信息；actor 用于修订记录。 */
export interface Identity {
  /** human = 浏览器登录；service = 服务令牌 */
  kind: 'human' | 'service';
  email: string | null;
  role: Role;
  /** 写修订时的操作者描述，如 "owner (proposal 01ABC…)" */
  actor: string;
}

/** 路由 → 允许的角色表（03-api 各表的“角色”列）；未列出的接口默认全角色或公开。 */
export type RouteRoles = Record<string, Role[]>;

// 03-api.md 的角色表（owner 总是允许，这里列出全部）。
export const ROUTE_ROLES: RouteRoles = {
  'GET /api/entries': ['owner', 'agent'],
  'GET /api/entries/:id': ['owner', 'agent'],
  'POST /api/entries': ['owner'],
  'PUT /api/entries/:id': ['owner'],
  'PATCH /api/entries/:id': ['owner'],
  'DELETE /api/entries/:id': ['owner'],
  'GET /api/entries/:id/revisions': ['owner'],
  'GET /api/entries/:id/revisions/:version': ['owner'],
  'POST /api/entries/:id/restore': ['owner'],
  'POST /api/capture': ['owner', 'agent', 'capture'],
  'GET /api/stacks': ['owner', 'agent'],
  'POST /api/stacks': ['owner'],
  'PUT /api/stacks/:id': ['owner'],
  'DELETE /api/stacks/:id': ['owner'],
  'PUT /api/stacks/:id/entries': ['owner'],
  'PATCH /api/stacks/:id/entries/:entryId': ['owner'],
  'GET /api/stacks/:id/checklist': ['owner', 'agent'],
  'GET /api/types': ['owner', 'agent'],
  'POST /api/types': ['owner'],
  'PUT /api/types/:id': ['owner'],
  'DELETE /api/types/:id': ['owner'],
  'GET /api/platforms': ['owner', 'agent'],
  'POST /api/platforms': ['owner'],
  'PUT /api/platforms/:id': ['owner'],
  'DELETE /api/platforms/:id': ['owner'],
  'GET /api/settings/rules': ['owner', 'agent'],
  'PUT /api/settings/rules': ['owner'],
  'POST /api/tags/rename': ['owner'],
  'GET /api/sync': ['owner'],
  'GET /api/proposals': ['owner'],
  'POST /api/proposals': ['agent'],
  'POST /api/proposals/:id/accept': ['owner'],
  'POST /api/proposals/:id/reject': ['owner'],
  'POST /api/proposals/bulk': ['owner'],
  'GET /api/export': ['owner', 'backup'],
  'POST /api/import': ['owner'],
};

/** 按“方法 + 模式”检查角色；不在表里的接口（/api/health、/api/me）允许任何已登录身份。 */
export function roleAllowed(roles: Role[] | undefined, role: Role): boolean {
  if (!roles) return true;
  return roles.includes(role);
}
