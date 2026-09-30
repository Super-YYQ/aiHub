// 快速记录转换：把一段文本变成“待整理”条目草稿（见 docs/detailed/03-api.md#快速记录，与原型一致）。
import { slugify } from './ids';

export interface CaptureInput {
  type: string;
  text: string;
  sourceUrl?: string;
  stackId?: string;
}

export interface CaptureLink {
  label: string;
  url: string;
}
export interface CaptureSnippet {
  label: string;
  lang: string;
  code: string;
  install: boolean;
}

/** 快速记录生成的条目草稿（不含 id/version/时间戳，由服务端补齐）。 */
export interface CaptureDraft {
  type: string;
  slug: string;
  title: string;
  summary: string;
  status: 'inbox';
  pinned: false;
  rating: 0;
  platforms: string[];
  tags: string[];
  fields: Record<string, string>;
  snippets: CaptureSnippet[];
  links: CaptureLink[];
  body: string;
}

const URL_RE = /^https?:\/\/\S+$/;

export function captureToDraft(input: CaptureInput): CaptureDraft {
  const type = input.type;
  const t = String(input.text ?? '').trim();
  const isUrl = URL_RE.test(t);
  const firstLine = t.replace(/\r\n?/g, '\n').split('\n')[0] ?? '';
  let title = firstLine.slice(0, 60);
  if (isUrl) {
    try {
      const u = new URL(t);
      title = (u.hostname + u.pathname).replace(/\/$/, '');
    } catch {
      /* 解析失败时保留原文首行 */
    }
  }
  const long = !isUrl && t.length > 60;
  const slugSource = isUrl ? title.split('/').pop() || title : title;

  const links: CaptureLink[] = [];
  if (input.sourceUrl && URL_RE.test(input.sourceUrl.trim())) {
    links.push({ label: '来源', url: input.sourceUrl.trim() });
  } else if (isUrl) {
    links.push({ label: '来源', url: t });
  }

  return {
    type,
    slug: slugify(slugSource),
    title,
    summary: '',
    status: 'inbox',
    pinned: false,
    rating: 0,
    platforms: [],
    tags: [],
    fields: {},
    snippets:
      long && type === 'prompt' ? [{ label: '提示词', lang: 'text', code: t, install: false }] : [],
    links,
    body: long && type !== 'prompt' ? t : '',
  };
}
