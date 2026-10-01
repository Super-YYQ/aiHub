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
  // 桌面端等 .rail，移动端等 .tabbar
  const navSelector = page.viewportSize()!.width > 860 ? '.rail' : '.tabbar';
  await expect(page.locator(navSelector)).toBeVisible({ timeout: 15000 });
  await page.reload();
  await expect(page.locator(navSelector)).toBeVisible({ timeout: 15000 });

  // 等待数据同步到 Dexie（检查 IndexedDB 里有数据）
  const hasData = await page.evaluate(async () => {
    return new Promise<boolean>((resolve) => {
      // 设置超时防止卡死
      const timeout = setTimeout(() => resolve(false), 5000);
      const req = indexedDB.open('aikit', 1);
      req.onsuccess = () => {
        clearTimeout(timeout);
        const db = req.result;
        try {
          const tx = db.transaction('entries', 'readonly');
          const store = tx.objectStore('entries');
          const countReq = store.count();
          countReq.onsuccess = () => {
            resolve(countReq.result > 0);
          };
          countReq.onerror = () => resolve(false);
        } catch {
          resolve(false);
        }
      };
      req.onerror = () => {
        clearTimeout(timeout);
        resolve(false);
      };
    });
  });
  if (!hasData) {
    // 等待同步完成
    await page.waitForTimeout(5000);
  }

  // 断网：仍然能打开页面并搜索已缓存的条目
  await context.setOffline(true);
  await page.goto('/');
  await expect(page.locator(navSelector)).toBeVisible({ timeout: 10000 });
  // 命令面板搜索缓存数据（Dexie 提供）
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(500); // 等待 dialog 打开
  const input = page.getByPlaceholder('搜索名称、标签、命令或提示词内容');
  await expect(input).toBeVisible({ timeout: 3000 });
  await input.fill('playwright');
  await page.waitForTimeout(400); // 等待搜索结果渲染
  await expect(page.getByRole('option').filter({ hasText: 'Playwright MCP' })).toBeVisible({
    timeout: 10000,
  });
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
