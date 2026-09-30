// 变量解析与替换：片段里的 {{名称}}，复制前填写（见 docs/detailed/02-data-model.md 片段说明）。
// 名称去掉首尾空白后比较；未填写的变量保留原样。

const VAR_RE = /\{\{([^{}]+)\}\}/g;

/** 解析出片段里出现的变量名（去重、去首尾空白，保持首次出现顺序）。 */
export function parseVariables(code: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  let m: RegExpExecArray | null;
  VAR_RE.lastIndex = 0;
  while ((m = VAR_RE.exec(String(code))) !== null) {
    const name = m[1].trim();
    if (name && !seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

/** 用 values 替换 {{名称}}；名称按去空白后匹配，未提供或为空则保留原样。 */
export function applyVariables(code: string, values: Record<string, string>): string {
  return String(code).replace(VAR_RE, (whole, inner: string) => {
    const name = inner.trim();
    const v = values[name];
    return v != null && v !== '' ? v : whole;
  });
}
