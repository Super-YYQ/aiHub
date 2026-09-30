// 密钥扫描：前端保存前提示，服务端所有写入路径强制执行（见 docs/detailed/05-security.md#密钥扫描）。
// 命中返回字段路径、规则 ID 和脱敏预览（前 4 + … + 后 4）；占位符写法不算命中。

export interface SecretRule {
  id: string;
  re: RegExp;
  /** 命中后用于取“值”的捕获组序号（assignment 用），默认取整个匹配。 */
  valueGroup?: number;
}

// 说明：正则用全局标志以便逐个匹配。openai-key 会同时命中 sk-ant 前缀，属预期（都拒绝即可）。
export const SECRET_RULES: SecretRule[] = [
  { id: 'anthropic-key', re: /sk-ant-[A-Za-z0-9_-]{20,}/g },
  { id: 'openai-key', re: /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/g },
  { id: 'github-token', re: /gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,}/g },
  { id: 'aws-access-key', re: /AKIA[0-9A-Z]{16}/g },
  { id: 'google-api-key', re: /AIza[0-9A-Za-z_-]{35}/g },
  { id: 'slack-token', re: /xox[baprs]-[A-Za-z0-9-]{10,}/g },
  { id: 'private-key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  {
    id: 'jwt',
    re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  },
  {
    id: 'assignment',
    re: /(?:api[_-]?key|secret|token|password|passwd)\s*[:=]\s*['"]?([^\s'"$<]{12,})/gi,
    valueGroup: 1,
  },
];

/** 占位符写法（不算命中）：${VAR}、$VAR、<your-token>、全大写的 YOUR_TOKEN 形式、***。 */
export function isPlaceholder(value: string): boolean {
  if (value.includes('${')) return true;
  if (/^\$[A-Za-z_]\w*$/.test(value)) return true;
  if (/^<[^>]+>$/.test(value)) return true;
  if (value.includes('***')) return true;
  // 全大写下划线标识（YOUR_TOKEN、MY_SECRET_VALUE…）；真实令牌不含此形状（AWS 无下划线）。
  if (/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/.test(value)) return true;
  return false;
}

function preview(secret: string): string {
  if (secret.length <= 8) return '…';
  return `${secret.slice(0, 4)}…${secret.slice(-4)}`;
}

export interface SecretFinding {
  path: string;
  ruleId: string;
  preview: string;
}

/** 扫描单段文本，返回命中列表（占位符已排除）。 */
export function scanText(text: string, path = ''): SecretFinding[] {
  const out: SecretFinding[] = [];
  if (!text) return out;
  for (const rule of SECRET_RULES) {
    rule.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.re.exec(text)) !== null) {
      const value = rule.valueGroup != null ? m[rule.valueGroup] : m[0];
      if (m[0].length === 0) {
        rule.re.lastIndex++;
        continue;
      }
      if (!value || isPlaceholder(value)) continue;
      out.push({ path, ruleId: rule.id, preview: preview(value) });
    }
  }
  return out;
}

/** 待扫描的条目形状（只取需要扫描的字段）。 */
export interface ScannableEntry {
  title?: string;
  summary?: string;
  tags?: string[];
  fields?: Record<string, string>;
  snippets?: { label?: string; code?: string }[];
  links?: { label?: string; url?: string }[];
  body?: string;
}

/** 扫描条目全部文本字段（名称、说明、标签、要点值、片段、链接、笔记）。 */
export function scanEntry(entry: ScannableEntry): SecretFinding[] {
  const out: SecretFinding[] = [];
  const add = (text: string | undefined, path: string) => {
    if (text) out.push(...scanText(text, path));
  };
  add(entry.title, 'title');
  add(entry.summary, 'summary');
  (entry.tags ?? []).forEach((t, i) => add(t, `tags[${i}]`));
  for (const [k, v] of Object.entries(entry.fields ?? {})) add(v, `fields.${k}`);
  (entry.snippets ?? []).forEach((s, i) => {
    add(s.label, `snippets[${i}].label`);
    add(s.code, `snippets[${i}].code`);
  });
  (entry.links ?? []).forEach((l, i) => {
    add(l.label, `links[${i}].label`);
    add(l.url, `links[${i}].url`);
  });
  add(entry.body, 'body');
  return out;
}

export function hasSecret(text: string): boolean {
  return scanText(text).length > 0;
}
