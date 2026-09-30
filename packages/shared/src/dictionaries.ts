// 内置字典：类型、平台、状态、环境种类与系统。
// 类型颜色取自原型 prototype/styles.css 的浅色类型色（见 docs/detailed/02-data-model.md#表结构）。
// 字段模板取自原型 prototype/app.js 的 TYPES。

export interface BuiltinType {
  id: string;
  name: string;
  color: string;
  fieldTemplate: string[];
  sort: number;
  builtin: true;
}

export interface BuiltinPlatform {
  id: string;
  name: string;
  sort: number;
  builtin: true;
}

export const BUILTIN_TYPES: BuiltinType[] = [
  {
    id: 'tool',
    name: '工具',
    color: '#2f6db5',
    fieldTemplate: ['类别', '安装方式', '配置目录', '费用'],
    sort: 0,
    builtin: true,
  },
  {
    id: 'prompt',
    name: '提示词',
    color: '#8349bd',
    fieldTemplate: ['适用场景', '推荐模型', '变量'],
    sort: 1,
    builtin: true,
  },
  {
    id: 'skill',
    name: 'Skill',
    color: '#237f50',
    fieldTemplate: ['宿主', '来自插件', '触发'],
    sort: 2,
    builtin: true,
  },
  {
    id: 'mcp',
    name: 'MCP',
    color: '#c43d32',
    fieldTemplate: ['传输', '命令', '地址', '作用域', '需要的环境变量'],
    sort: 3,
    builtin: true,
  },
  {
    id: 'hook',
    name: 'Hook',
    color: '#a36700',
    fieldTemplate: ['事件', '匹配器', '配置位置', '依赖'],
    sort: 4,
    builtin: true,
  },
  {
    id: 'plugin',
    name: '插件',
    color: '#0b7a87',
    fieldTemplate: ['市场', '包含', '来源仓库'],
    sort: 5,
    builtin: true,
  },
  {
    id: 'config',
    name: '配置',
    color: '#56626f',
    fieldTemplate: ['文件路径', '引用方式', '生效范围'],
    sort: 6,
    builtin: true,
  },
  {
    id: 'model',
    name: '模型与 API',
    color: '#ad3571',
    fieldTemplate: ['服务商', '常用模型', '密钥变量'],
    sort: 7,
    builtin: true,
  },
];

export const BUILTIN_PLATFORMS: BuiltinPlatform[] = [
  { id: 'claude-code', name: 'Claude Code', sort: 0, builtin: true },
  { id: 'codex', name: 'Codex', sort: 1, builtin: true },
  { id: 'cursor', name: 'Cursor', sort: 2, builtin: true },
  { id: 'claude-app', name: 'Claude 客户端', sort: 3, builtin: true },
  { id: 'chatgpt', name: 'ChatGPT', sort: 4, builtin: true },
  { id: 'general', name: '通用', sort: 5, builtin: true },
];

export const STATUSES = ['inbox', 'using', 'trying', 'wishlist', 'archived'] as const;
export type Status = (typeof STATUSES)[number];
export const STATUS_NAMES: Record<Status, string> = {
  inbox: '待整理',
  using: '在用',
  trying: '试用中',
  wishlist: '想试',
  archived: '已弃用',
};

export const STACK_KINDS = ['pc', 'server', 'phone', 'tablet', 'scene'] as const;
export type StackKind = (typeof STACK_KINDS)[number];

export const STACK_OS = ['windows', 'macos', 'linux', 'ios', 'android', 'any'] as const;
export type StackOs = (typeof STACK_OS)[number];

/** 内置类型 ID 到 sort 的映射，供“按类型排序”复用。 */
export const TYPE_ORDER: Record<string, number> = Object.fromEntries(
  BUILTIN_TYPES.map((t) => [t.id, t.sort]),
);
