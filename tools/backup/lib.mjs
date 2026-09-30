// lib.mjs — 从 packages/shared 的构建产物加载共用函数（tools 无构建步骤，直接用 dist）。
// 供 check-export/to-markdown 共用；类型名兜底表用于导出文件缺字典时的显示。
import { pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const sharedDist = resolve(here, '../../packages/shared/dist/index.js');

export const { serializeEntry, buildChecklist, TYPE_ORDER } = await import(
  pathToFileURL(sharedDist).href
);

export const BUILTIN_TYPE_NAME_FALLBACK = {
  tool: '工具',
  prompt: '提示词',
  skill: 'Skill',
  mcp: 'MCP',
  hook: 'Hook',
  plugin: '插件',
  config: '配置',
  model: '模型与 API',
};
