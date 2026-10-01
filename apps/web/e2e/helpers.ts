import { type Page, expect } from '@playwright/test';

/**
 * 等待数据同步完成：通过等待任意数据元素出现来确认 IndexedDB 已填充。
 * 首次访问时 App.vue 会调用 sync()，这个函数等待它完成。
 */
export async function waitForDataSync(page: Page, timeout = 20000) {
  // 等待任意一种数据元素出现（三栏行、列表项、卡片或树节点）
  const dataLocator = page.locator('.row, .l-item, .card, .bcard, .tree-leaf').first();
  await expect(dataLocator).toBeVisible({ timeout });
}

/**
 * 等待指定 URL 的 API 请求完成
 */
export async function waitForApiResponse(page: Page, urlPattern: string | RegExp, timeout = 10000) {
  await page.waitForResponse(
    (response) => {
      const url = response.url();
      if (typeof urlPattern === 'string') {
        return url.includes(urlPattern);
      }
      return urlPattern.test(url);
    },
    { timeout },
  );
}
