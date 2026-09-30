// 显示辅助：日期、状态/平台/类型名（组件共用）。
import { STATUS_NAMES, STATUSES } from '@aikit/shared';
import type { Entry } from '@aikit/shared';

export function statusName(s: string): string {
  return STATUS_NAMES[s as keyof typeof STATUS_NAMES] ?? s;
}

export function relDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const days = Math.round((now.getTime() - d.getTime()) / 86400000);
  if (days <= 0) return '今天';
  if (days === 1) return '昨天';
  if (days < 30) return `${days} 天前`;
  return d.toISOString().slice(0, 10);
}

export function scopeEntries(entries: Entry[], scope: string): Entry[] {
  if (scope === 'all') return entries.filter((e) => e.status !== 'archived');
  if (scope === 'pinned') return entries.filter((e) => e.pinned);
  if ((STATUSES as readonly string[]).includes(scope))
    return entries.filter((e) => e.status === scope);
  return entries.filter((e) => e.type === scope);
}

export function scopeName(scope: string, typeName: (id: string) => string): string {
  if (scope === 'all') return '全部条目';
  if (scope === 'pinned') return '置顶';
  if ((STATUSES as readonly string[]).includes(scope)) return statusName(scope);
  return typeName(scope);
}
