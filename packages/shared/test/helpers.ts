import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { PrototypeExport } from '../src/prototype';

/** 读取并执行 prototype/data.js，取出 window.AIKIT_SEED（测试单一数据源）。 */
export function loadPrototypeSeed(): PrototypeExport {
  const path = fileURLToPath(new URL('../../../prototype/data.js', import.meta.url));
  const src = readFileSync(path, 'utf8');
  const win: { AIKIT_SEED?: PrototypeExport } = {};
  // data.js 形如 window.AIKIT_SEED = {...}
  const run = new Function('window', `${src}\nreturn window.AIKIT_SEED;`);
  return run(win) as PrototypeExport;
}
