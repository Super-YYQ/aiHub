// ULID 生成/校验与 slug 规则。ULID 由服务端生成，离线时允许客户端先生成（见 03-api#离线新建）。

const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford Base32
const ENCODING_LEN = 32;
const TIME_LEN = 10;
const RANDOM_LEN = 16;

function encodeTime(now: number): string {
  let time = now;
  let out = '';
  for (let i = TIME_LEN - 1; i >= 0; i--) {
    const mod = time % ENCODING_LEN;
    out = ENCODING[mod] + out;
    time = (time - mod) / ENCODING_LEN;
  }
  return out;
}

function encodeRandom(): string {
  const bytes = new Uint8Array(RANDOM_LEN);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  // 256 是 32 的整数倍，取模 32 无偏。
  for (let i = 0; i < RANDOM_LEN; i++) out += ENCODING[bytes[i] % ENCODING_LEN];
  return out;
}

/** 生成一个 ULID（26 位，按时间单调递增的前缀 + 随机后缀）。 */
export function ulid(seedTime: number = Date.now()): string {
  return encodeTime(seedTime) + encodeRandom();
}

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
export function isUlid(value: unknown): value is string {
  return typeof value === 'string' && ULID_RE.test(value);
}

// slug：1–64 字符，只含小写字母、数字、汉字和 -，不以 - 开头或结尾。
const CJK = '一-龥';
export const SLUG_RE = new RegExp(`^[a-z0-9${CJK}](?:[a-z0-9${CJK}-]*[a-z0-9${CJK}])?$`);

export function isValidSlug(value: string): boolean {
  return value.length >= 1 && value.length <= 64 && SLUG_RE.test(value);
}

/** 把任意文本转成合法 slug；无有效字符时回退为 'item'。 */
export function slugify(input: string): string {
  const s = String(input)
    .trim()
    .toLowerCase()
    .replace(new RegExp(`[^a-z0-9${CJK}]+`, 'g'), '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '');
  return s || 'item';
}

/** 8 位随机串，作为片段在条目内的稳定引用 id。 */
export function snippetId(): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < 8; i++) out += ENCODING[bytes[i] % ENCODING_LEN].toLowerCase();
  return out;
}
