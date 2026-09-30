import { test, expect } from '@playwright/test';

// WP13 可自动化部分：Android share_target 参数 → 打开记录面板并预填。
// iOS 快捷指令与真机分享见 docs/shortcuts.md 与 PENDING-MANUAL.md。

test('分享目标参数：打开记录面板并预填链接', async ({ page }) => {
  // 模拟 Android 分享进来的 URL（share_target action=/ + 参数）
  await page.goto('/?title=一个好用的工具&text=看到就想试&url=https%3A%2F%2Fexample.com%2Ftool');

  const sheet = page.getByRole('dialog', { name: '记一笔' });
  await expect(sheet).toBeVisible({ timeout: 10000 });
  const textarea = sheet.getByLabel('内容');
  await expect(textarea).toHaveValue(/一个好用的工具/);
  await expect(textarea).toHaveValue(/看到就想试/);
  await expect(textarea).toHaveValue(/https:\/\/example\.com\/tool/);

  // 存入待整理（DOM 提交表单，绕开弹出动画的稳定性判定）
  await page.waitForTimeout(400);
  await sheet.evaluate((el) => (el as HTMLFormElement).requestSubmit());
  await expect(page.getByText('已存入待整理')).toBeVisible();

  // 刷新不再次弹出（参数已在预填后清理）
  await page.reload();
  await expect(page.getByRole('dialog', { name: '记一笔' })).toHaveCount(0);
});
