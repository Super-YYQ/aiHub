import { test, expect } from '@playwright/test';

// WP8 PWA 验收（可自动化的部分）：manifest、SW、离线缓存、更新提示。
// “添加到主屏/独立窗口/真机”见 PENDING-MANUAL.md。

test('manifest 可访问且字段正确', async ({ request }) => {
  const res = await request.get('/manifest.webmanifest');
  expect(res.ok()).toBeTruthy();
  const manifest = (await res.json()) as {
    name: string;
    display: string;
    start_url: string;
    icons: Array<{ src: string; sizes: string }>;
    shortcuts: Array<{ name: string }>;
  };
  expect(manifest.name).toBe('AI 工作台');
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toBe('/');
  expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
  expect(manifest.shortcuts.map((s) => s.name)).toEqual(['工作台', '待整理', '环境']);
});

test('图标可访问', async ({ request }) => {
  for (const icon of [
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/icons/icon-512-maskable.png',
  ]) {
    const res = await request.get(icon);
    expect(res.ok(), icon).toBeTruthy();
    expect(res.headers()['content-type']).toContain('image/png');
  }
});

test('Service Worker 注册并预缓存，断网后仍能打开与搜索', async ({ page, context }) => {
  // 等待 SW 注册（index.html 的 load 事件里注册）
  await page.goto('/');
  await page.waitForFunction(
    () => navigator.serviceWorker.ready.then(() => true).catch(() => false),
    undefined,
    { timeout: 15000 },
  );
  // 预缓存里有 SPA 首页
  const cachedKeys = await page.evaluate(async () => {
    const keys = await caches.keys();
    const out: string[] = [];
    for (const k of keys) {
      const cache = await caches.open(k);
      out.push(...(await cache.keys()).map((r) => new URL(r.url).pathname));
    }
    return out;
  });
  expect(cachedKeys).toContain('/');

  // SW 接管后重载一次：静态资源这次经 SW（进缓存），模拟第二次访问
  await expect(page.locator('.nav-item').first()).toBeVisible({ timeout: 15000 });
  await page.reload();
  await expect(page.locator('.nav-item').first()).toBeVisible({ timeout: 15000 });

  // 断网：仍然能打开页面并搜索已缓存的条目
  await context.setOffline(true);
  await page.goto('/');
  await expect(page.locator('.rail')).toBeVisible({ timeout: 10000 });
  // 命令面板搜索缓存数据（Dexie 提供）
  await page.keyboard.press('Control+k');
  const input = page.getByPlaceholder('搜索名称、标签、命令或提示词内容');
  await input.fill('playwright');
  await expect(page.getByRole('option').filter({ hasText: 'Playwright MCP' })).toBeVisible();
  await context.setOffline(false);
});

test('更新提示：SW 有新版本时出现“有新版本，刷新后生效”', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(
    () => navigator.serviceWorker.ready.then(() => true).catch(() => false),
    undefined,
    { timeout: 15000 },
  );
  // 直接派发与 SW 更新同名的应用事件，验证横幅行为（真更新流程由 SW 触发同一事件）
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('aikit:update-ready')));
  const banner = page.getByTestId('update-banner');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('有新版本，刷新后生效');
  // “稍后”关闭横幅，由用户决定何时刷新
  await banner.getByRole('button', { name: '稍后' }).click();
  await expect(banner).toHaveCount(0);
});
