// 全局快捷键（04-frontend#快捷键）：Ctrl/⌘+K 或 / 打开搜索；n 新建；Esc 关闭面板。
export interface ShortcutHandlers {
  openSearch: () => void;
  openCapture: () => void;
}

export function shortcuts(handlers: ShortcutHandlers): () => void {
  const onKey = (ev: KeyboardEvent) => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') {
      ev.preventDefault();
      handlers.openSearch();
      return;
    }
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const a = document.activeElement as HTMLElement | null;
    const inInput = a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable);
    if (ev.key === '/' && !inInput) {
      ev.preventDefault();
      handlers.openSearch();
    } else if (ev.key === 'n' && !inInput) {
      handlers.openCapture();
    }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
