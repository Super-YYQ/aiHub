/** Worker 运行环境绑定与配置项（见 docs/detailed/01-architecture.md#配置项）。 */
export interface Env {
  /** D1 数据库 */
  DB: D1Database;
  /** 前端静态资源 */
  ASSETS: Fetcher;

  /** development | production */
  ENVIRONMENT: string;
  /** 形如 https://<团队名>.cloudflareaccess.com */
  ACCESS_TEAM_DOMAIN: string;
  /** Access 应用的 AUD 标签 */
  ACCESS_AUD: string;
  /** 允许登录的邮箱，逗号分隔 */
  ALLOWED_EMAILS: string;
  /** 服务令牌 Client ID -> 角色 的 JSON 映射 */
  SERVICE_TOKEN_ROLES: string;
  /** 仅本地开发：跳过 Access 时使用的身份（放在 .dev.vars，不提交） */
  DEV_AUTH_EMAIL?: string;
}
