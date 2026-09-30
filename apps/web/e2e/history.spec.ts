import { test, expect } from '@playwright/test';

// WP11 验收：修改三次后历史抽屉列出 3 个旧版本；对比差异正确；恢复生成新版本，旧版本仍在。

test('历史版本：三次修改 → 3 个旧版本 → 差异对比 → 恢复', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push((e as Error).name + ':' + (e as Error).message));

  // 新建一条（v1），随后在详情里 PATCH 三次说明（每次经 API 快速改，保持测试简洁）
  await page.goto('/new/tool');
  const title = `历史测试 ${Date.now().toString(36)}`;
  await page.getByTestId('entry-title').fill(title);
  await page.getByLabel('一句话说明').fill('第零版说明');
  await page.getByTestId('save-button').click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  const entryUrl = page.url();
  const entryId = entryUrl.split('/').pop() ?? '';

  // 连续三次更新（PUT 换说明；用 API 直接做，页面操作三次太慢）
  const summarySeq = ['第一版说明', '第二版说明', '第三版说明'];
  let version = 1;
  for (const summary of summarySeq) {
    const res = await page.request.fetch(`/api/entries/${entryId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'If-Match': `"${version}"` },
      data: {
        type: 'tool',
        title,
        summary,
        status: 'using',
        rating: 0,
        platforms: [],
        tags: [],
        fields: {},
        snippets: [],
        links: [],
        body: summary === '第三版说明' ? '笔记第一行\n笔记第二行' : '',
      },
    });
    expect(res.status(), `PUT v${version} 应成功`).toBe(200);
    const body = (await res.json()) as { version: number };
    version = body.version;
  }

  // 打开详情 → 历史抽屉：列出 3 个旧版本（v1、v2、v3）
  await page.goto(entryUrl);
  await page.getByTestId('history-button').click();
  const drawer = page.getByTestId('revision-drawer');
  await expect(drawer).toBeVisible();
  await expect(page.getByTestId('revision-3')).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('revision-2')).toBeVisible();
  await expect(page.getByTestId('revision-1')).toBeVisible();

  // 选 v1 对比当前：说明差异 + 笔记逐行差异
  await page.getByTestId('revision-1').click();
  const diffTable = page.getByTestId('diff-table');
  await expect(diffTable).toBeVisible({ timeout: 10000 });
  await expect(diffTable).toContainText('第零版说明'); // v1 的说明
  await expect(diffTable).toContainText('第三版说明'); // 当前的说明
  // 笔记逐行差异（v1 笔记为空 → 新增两行）
  await expect(diffTable.locator('.line.added').first()).toContainText('笔记第一行');

  // 恢复 v3（其内容是“第二版说明”）→ 生成新版本（v5），旧版本仍在
  await page.getByTestId('revision-3').click();
  await page.getByTestId('restore-button').click();
  await expect(page.getByText('已恢复该版本')).toBeVisible({ timeout: 10000 });
  // 重新打开：修订仍有 3+1 条（恢复产生新修订），旧版本仍在
  await page.goto(entryUrl);
  await page.getByTestId('history-button').click();
  await expect(page.getByTestId('revision-3')).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('revision-1')).toBeVisible();
  await page.keyboard.press('Escape');
  // 详情显示恢复后的说明
  await expect(page.getByText('第二版说明').first()).toBeVisible({ timeout: 10000 });
  expect(errors).toEqual([]);
});
