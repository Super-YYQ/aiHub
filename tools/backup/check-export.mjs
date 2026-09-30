// check-export.mjs — 校验导出文件（06-ops#备份）：
// schemaVersion=1 且条目数为 0 时退出码 1（防止用空数据覆盖镜像），否则打印条目数。
// 用法：node tools/backup/check-export.mjs export.json
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [, , fileArg] = process.argv;
if (!fileArg) {
  console.error('用法：node check-export.mjs <export.json>');
  process.exit(2);
}

let data;
try {
  data = JSON.parse(readFileSync(resolve(fileArg), 'utf8'));
} catch (err) {
  console.error(`无法读取或解析导出文件：${err.message}`);
  process.exit(2);
}

if (data.schemaVersion !== 1) {
  console.error(`schemaVersion 不是 1（收到 ${String(data.schemaVersion)}），文件格式不认识。`);
  process.exit(1);
}
if (!Array.isArray(data.entries)) {
  console.error('导出文件里没有 entries 数组。');
  process.exit(1);
}
if (data.entries.length === 0) {
  console.error('条目数为 0：可能导出失败，停止备份，防止空数据覆盖镜像。');
  process.exit(1);
}

console.log(`导出文件有效：${data.entries.length} 条条目、${(data.stacks ?? []).length} 个环境。`);
