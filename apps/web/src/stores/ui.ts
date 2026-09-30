// 外观与同步状态（08-ui-spec#切换与保存；04-frontend#状态与离线同步）。
import { defineStore } from 'pinia';
import { onSyncState, type SyncStatus } from '../lib/sync';

export type LayoutId = 'panes' | 'gallery' | 'launcher' | 'board' | 'docs';
export type StyleId = 'soft' | 'calm' | 'glass';
export type ThemePref = 'system' | 'light' | 'dark';

const LS = {
  layout: 'aikit.layout',
  style: 'aikit.style',
  theme: 'aikit.theme',
} as const;

function readLocal(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export const useUiStore = defineStore('ui', {
  state: () => {
    const params = new URLSearchParams(location.search);
    const prefersDark =
      typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
    const themePref =
      (params.get('theme') as ThemePref | null) ?? (readLocal(LS.theme, 'system') as ThemePref);
    return {
      layout:
        (params.get('layout') as LayoutId | null) ?? (readLocal(LS.layout, 'panes') as LayoutId),
      style: (params.get('style') as StyleId | null) ?? (readLocal(LS.style, 'calm') as StyleId),
      themePref,
      resolvedTheme:
        themePref === 'dark' || (themePref === 'system' && prefersDark) ? 'dark' : 'light',
      syncStatus: 'idle' as SyncStatus,
      lastSyncAt: null as string | null,
      toast: null as { text: string } | null,
      paletteOpen: false,
      captureOpen: false,
      appearanceOpen: false,
      conflictOpen: false,
      updateReady: false,
      sharePrefill: null as { title: string; text: string; url: string } | null,
    };
  },
  actions: {
    applyAppearance() {
      const el = document.documentElement;
      el.dataset.layout = this.layout;
      el.dataset.style = this.style;
      el.dataset.theme = this.resolvedTheme;
      // PWA 主题色跟随当前外观的背景色（04-frontend#PWA）
      const themeColor = this.resolvedTheme === 'dark' ? '#141b22' : '#f2f4f3';
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute(
          'content',
          this.style === 'soft' && this.resolvedTheme === 'dark' ? '#151a23' : themeColor,
        );
    },
    setLayout(layout: LayoutId) {
      this.layout = layout;
      localStorage.setItem(LS.layout, layout);
      this.applyAppearance();
    },
    setStyle(style: StyleId) {
      this.style = style;
      localStorage.setItem(LS.style, style);
      this.applyAppearance();
    },
    setThemePref(pref: ThemePref) {
      this.themePref = pref;
      localStorage.setItem(LS.theme, pref);
      const prefersDark =
        typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
      this.resolvedTheme = pref === 'dark' || (pref === 'system' && prefersDark) ? 'dark' : 'light';
      this.applyAppearance();
    },
    toggleTheme() {
      this.setThemePref(this.resolvedTheme === 'dark' ? 'light' : 'dark');
    },
    // PWA：新版本已就绪 → 显示“有新版本，刷新后生效”（04-frontend#PWA）
    watchUpdate() {
      window.addEventListener('aikit:update-ready', () => {
        this.updateReady = true;
      });
    },
    async applyUpdate() {
      this.updateReady = false;
      // 通知等待中的新版本接管；接管消息到达后刷新
      try {
        const reg = await navigator.serviceWorker?.getRegistration();
        reg?.waiting?.postMessage({ kind: 'skip-waiting' });
      } catch {
        /* 无 SW 时直接走下面的兜底刷新 */
      }
      setTimeout(() => location.reload(), 800);
    },
    watchSync() {
      onSyncState((status, at) => {
        this.syncStatus = status;
        this.lastSyncAt = at;
      });
      if (typeof matchMedia === 'function') {
        const mq = matchMedia('(prefers-color-scheme: dark)');
        const handler = () => {
          if (this.themePref === 'system') {
            this.resolvedTheme = mq.matches ? 'dark' : 'light';
            this.applyAppearance();
          }
        };
        mq.addEventListener('change', handler);
      }
    },
    showToast(text: string) {
      this.toast = { text };
      setTimeout(() => {
        this.toast = null;
      }, 1800);
    },
  },
});
