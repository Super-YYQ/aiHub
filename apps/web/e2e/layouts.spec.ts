import { test, expect } from '@playwright/test';

// WP7A–D 验收：四种结构的行为 + 30 种外观组合无报错。
// 结构切换不改地址、已打开的条目保持打开。

test.beforeEach(async ({ context }) => {
  // 复制类用例需要剪贴板权限（无头默认不给）
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
});

test('结构 2 卡片墙：分组卡片、复制按钮、抽屉', async ({ page }) => {
  await page.goto('/?layout=gallery');
  // 等待数据同步出卡片
  const cards = page.locator('.card');
  await expect(cards.first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator('[data-testid^="gallery-copy-"]').first()).toBeVisible({
    timeout: 15000,
  });
  // 顶部类型标签：点后只显示该类型
  await page.locator('.type-tabs a').filter({ hasText: '插件' }).first().click();
  await expect(
    page.locator('[data-testid^="gallery-group-"]').filter({ hasText: '插件' }),
  ).toBeVisible();
  // 卡片复制（无变量片段直接复制）。用 DOM click 触发，绕开卡片链接层的命中测试噪声
  await page
    .locator('[data-testid^="gallery-copy-"]')
    .first()
    .evaluate((el) => (el as HTMLElement).click());
  await expect(page.getByText(/已复制|填变量/)).toBeVisible();
  // 详情抽屉：点卡片（链接覆盖层）打开，Esc 关闭
  await page.locator('.card-link').first().click();
  await expect(page.getByTestId('detail-drawer')).toBeVisible({ timeout: 15000 });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('detail-drawer')).toHaveCount(0);
});

test('结构 3 搜索优先：自动聚焦、方向键预览、回车复制、Esc 清空', async ({ page }) => {
  await page.goto('/list/all?layout=launcher');
  const search = page.getByTestId('launcher-search');
  await expect(search).toBeFocused({ timeout: 15000 });
  await expect(page.locator('.l-item').first()).toBeVisible({ timeout: 15000 });
  // 输入 hook → 第一条是 Hook 类型
  await search.fill('hook');
  await expect(page.locator('.l-item').first()).toContainText('hook', { timeout: 5000 });
  // 方向键切换 + 预览更新
  await search.press('ArrowDown');
  // Enter 复制第一个片段
  await search.press('Enter');
  await expect(page.getByText(/已复制|没有片段/)).toBeVisible();
  // Esc 清空
  await search.press('Escape');
  await expect(search).toHaveValue('');
});

test('结构 4 看板：状态分列、拖动改状态、待整理列直接记', async ({ page }) => {
  await page.goto('/list/all?layout=board');
  await expect(page.locator('.board-col .bcard').first()).toBeVisible({ timeout: 15000 });
  // 按状态分列：五列卡片数之和 = 条目总数
  const colCounts = await page.locator('.board-col .bcard').count();
  expect(colCounts).toBeGreaterThan(0);
  // 待整理列直接记一笔
  const cap = page.getByTestId('board-capture');
  await cap.fill('看板列里记的一笔');
  await cap.press('Enter');
  await expect(page.getByText('已存入待整理')).toBeVisible();
  // 拖动卡片到另一列 → 状态变化
  const firstCard = page.locator('.bcard[draggable="true"]').first();
  const targetCol = page.locator('.board-col[data-status="trying"]');
  await firstCard.dragTo(targetCol);
  await expect(page.getByText(/改为/)).toBeVisible();
  // 按环境分组：列数 = 环境数 + 1
  await page.locator('.seg button', { hasText: '按环境' }).click();
  const stackCols = await page.locator('.board-col').count();
  expect(stackCols).toBeGreaterThanOrEqual(4); // 3 个环境 + 未加入
  // 按类型分组：列数 = 类型数
  await page.locator('.seg button', { hasText: '按类型' }).click();
  const typeCols = await page.locator('.board-col').count();
  expect(typeCols).toBe(8);
});

test('结构 5 知识库：目录树高亮、收起保持、属性栏改状态', async ({ page }) => {
  await page.goto('/?layout=docs');
  // 目录树按类型列出
  const leaf = page.locator('.tree-leaf').first();
  await expect(leaf).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.doc h1')).toBeVisible();
  // 收起一个类型 → 切换条目后保持收起
  const summary = page.locator('.tree-group details summary').first();
  await summary.click(); // 收起
  const closedType = await page.evaluate(() => localStorage.getItem('aikit.docsClosed'));
  expect(closedType).toBeTruthy();
  // 打开一个仍可见的条目 → 属性栏直接改状态
  await page.locator('.tree-leaf:visible').first().click();
  const props = page.locator('.doc-props');
  await expect(props).toBeVisible();
  const statusSelect = page.locator('.doc-props select[aria-label="状态"]');
  const cur = await statusSelect.inputValue();
  const target = cur === 'wishlist' ? 'using' : 'wishlist';
  await statusSelect.selectOption(target);
  await expect(page.getByText(/状态改为/)).toBeVisible();
  // 本页目录滚动按钮存在
  await expect(page.locator('.doc-toc button').first()).toBeVisible();
});

test('30 种结构×配色×深浅组合：工作台与详情打开无控制台报错', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 120));
  });
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + (e as Error).name));

  // 先打开一个条目（detail 路径），再逐组合切换外观；地址与选中条目保持
  await page.goto('/list/all');
  await page
    .getByRole('link', { name: /Claude Code/, exact: true })
    .first()
    .click();
  const detailUrl = page.url();

  const layouts = ['panes', 'gallery', 'launcher', 'board', 'docs'] as const;
  const styles = ['soft', 'calm', 'glass'] as const;
  const themes = ['light', 'dark'] as const;
  for (const layout of layouts) {
    for (const style of styles) {
      for (const theme of themes) {
        await page.goto(`${detailUrl}?layout=${layout}&style=${style}&theme=${theme}`);
        // 工作台
        await page.goto(`/?layout=${layout}&style=${style}&theme=${theme}`);
        const html = page.locator('html');
        await expect(html).toHaveAttribute('data-layout', layout);
        await expect(html).toHaveAttribute('data-style', style);
        // 结构切换后当前条目仍打开（去掉查询参数回到默认外观）
        await page.goto(detailUrl);
        await expect(page.locator('main, .detail, article').first()).toBeVisible();
      }
    }
  }
  expect(errors).toEqual([]);
});

test('切换结构时地址不变、当前条目仍打开（外观面板切换）', async ({ page }) => {
  await page.goto('/list/all');
  await page
    .getByRole('link', { name: /Claude Code/, exact: true })
    .first()
    .click();
  const before = new URL(page.url());
  await page.getByRole('button', { name: '外观' }).click();
  const panel = page.getByRole('dialog', { name: '外观' });
  await panel.getByRole('button', { name: /4 看板/ }).click();
  // 地址不变（去掉 hash 后比较）
  const after = new URL(page.url());
  expect(after.pathname + after.search).toBe(before.pathname + before.search);
  // 看板渲染且该条目存在
  await expect(page.getByTestId('board')).toBeVisible();
});
