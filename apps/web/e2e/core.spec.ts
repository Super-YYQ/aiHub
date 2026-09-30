import { test, expect } from '@playwright/test';

// WP7 验收：原型已验证的核心行为（桌面 + 手机两种视口跑同一套用例）。
// 环境：wrangler dev（本地 D1 + 种子 21 条 + DEV_AUTH_EMAIL 免登录）。

test.beforeEach(async ({ context, page }) => {
  // 无头浏览器默认不给剪贴板权限；复制类用例需要显式授予
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
});

test('工作台显示种子数据并可快速记录', async ({ page }) => {
  await expect(page.getByTestId('pinned-panel')).toBeVisible();
  // 快速记录
  await page.getByTestId('capture-input').fill('E2E 记录的一个新工具');
  await page.getByTestId('capture-submit').click();
  // 同步后侧栏待整理计数出现（等待网络同步）
  await expect(page.getByText('已存入待整理')).toBeVisible();
});

test('命令面板：搜索 + Enter 打开 + Ctrl+Enter 复制', async ({ page }) => {
  await page.keyboard.press('Control+k');
  const input = page.getByPlaceholder('搜索名称、标签、命令或提示词内容');
  await expect(input).toBeFocused();
  await input.fill('playwright');
  // 第一条是 Playwright MCP
  await expect(page.getByRole('option').filter({ hasText: 'Playwright MCP' })).toBeVisible();
  // Ctrl+Enter 复制第一个片段
  await page.keyboard.press('Control+Enter');
  await expect(page.getByText(/已复制/)).toBeVisible();
});

test('详情页：改状态、复制为 Markdown、变量填写后复制', async ({ page }) => {
  await page.goto('/list/all');
  // 打开“中文代码评审”（提示词，含 {{变量}}）
  await page
    .getByRole('link', { name: /中文代码评审/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: '中文代码评审' })).toBeVisible();

  // 变量输入框存在；填好后复制
  await page.getByLabel('语言').fill('TypeScript');
  await page.getByLabel('关注点').fill('正确性');
  await page.getByRole('button', { name: '填好后复制' }).click();
  await expect(page.getByText(/已复制/)).toBeVisible();

  // 改状态（选一个与当前不同的状态，保证触发 change）
  const statusSelect = page.getByTestId('status-select');
  const current = await statusSelect.inputValue();
  const target = current === 'trying' ? 'using' : 'trying';
  await statusSelect.selectOption(target);
  await expect(page.getByText(/状态改为/)).toBeVisible();

  // 复制为 Markdown
  await page.getByTestId('copy-md').click();
  await expect(page.getByText('已复制为 Markdown')).toBeVisible();
});

test('新建与编辑条目', async ({ page }, testInfo) => {
  // 唯一前缀：desktop/mobile 两个项目共用同一个 worker，避免 slug 冲突
  const U = `${Date.now().toString(36)}-${testInfo.project.name}`;
  const title = `${U} 新建的工具`;
  await page.goto('/new/tool');
  await page.getByTestId('entry-title').fill(title);
  await page.getByLabel('一句话说明').fill('端到端测试创建');
  await page.getByTestId('save-button').click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();

  // 编辑改名称
  await page.getByRole('link', { name: '编辑' }).click();
  const renamed = `${title}（改名）`;
  await page.getByTestId('entry-title').fill(renamed);
  await page.getByTestId('save-button').click();
  await expect(page.getByRole('heading', { name: renamed })).toBeVisible();

  // 删除
  await page.getByRole('link', { name: '编辑' }).click();
  page.on('dialog', (d) => d.accept());
  await page.getByTestId('delete-button').click();
  await expect(page).toHaveURL(/\/list\/all/);
});

test('环境：添加与移出条目、生成安装清单', async ({ page }) => {
  await page.goto('/stacks');
  const stackLink = page.getByRole('link', { name: '主力 Windows 工作站', exact: true });
  await expect(stackLink).toBeVisible();
  await stackLink.click();

  // 生成安装清单
  await page.getByTestId('stack-checklist').click();
  await expect(page.getByTestId('checklist')).toBeVisible();
  await expect(page.locator('#checklist-text')).toHaveValue(/安装清单/);

  // 添加条目
  await page.getByTestId('stack-add-open').click();
  await page.locator('[data-testid^="picker-"]').first().check();
  await page.getByTestId('stack-add-confirm').click();

  // 移出
  const removeButton = page.locator('[data-testid^="stack-remove-"]').first();
  await removeButton.click();
  await expect(page.getByText(/已从环境移出/)).toBeVisible();
});

test('手机记录面板从底部弹出', async ({ page, viewport }) => {
  test.skip(viewport.width > 860, '手机视口专用');
  await page.getByRole('button', { name: '记一笔' }).click();
  const sheet = page.getByRole('dialog', { name: '记一笔' });
  await expect(sheet).toBeVisible();
  await page.getByLabel('内容').fill('手机上记的一笔');
  await sheet.getByRole('button', { name: '存入待整理' }).click();
  await expect(page.getByText('已存入待整理')).toBeVisible();
});

test('筛选栏：平台筛选 + 切换列表范围清空筛选', async ({ page }) => {
  await page.goto('/list/all');
  // 等平台字典同步完成（下拉里出现选项）
  const platformSelect = page.getByTestId('filter-platform');
  await expect(platformSelect.locator('option', { hasText: 'Claude Code' })).toBeAttached({
    timeout: 15000,
  });
  await platformSelect.selectOption('claude-code');
  await page.waitForTimeout(300);
  // 全部条目范围下应只显示 Claude Code 平台的条目（数量减少）
  const rowsWithPlatform = await page.getByTestId('entry-list').locator('.row').count();
  expect(rowsWithPlatform).toBeGreaterThan(0);

  // 切换范围 → 筛选被清空
  await page.goto('/list/tool');
  // 工具类型范围下筛选栏恢复“全部平台”
  await expect(page.getByTestId('filter-platform')).toHaveValue('', { timeout: 15000 });
});

test('用户内容被转义（XSS 防护）', async ({ page }, testInfo) => {
  // 新建一个带 <script> 的条目（标题唯一，避免与另一项目的 slug 冲突）
  const U = `${Date.now().toString(36)}-${testInfo.project.name}`;
  await page.goto(`/new/tool?title=${U} 注入测试`);
  await page.getByTestId('entry-title').fill('<img src=x onerror=alert(1)>');
  await page.getByLabel('一句话说明').fill('<script>alert("xss")</script>');
  await page.getByTestId('save-button').click();

  // 等待保存完成（可能因校验失败停在编辑页；两种情况都不该执行脚本）
  await page.waitForTimeout(800);
  const dialogPromise = page
    .waitForEvent('dialog', { timeout: 1500 })
    .then(() => true)
    .catch(() => false);
  expect(await dialogPromise).toBe(false);
});

test('外观面板切换配色立即生效并保持', async ({ page }) => {
  await page.getByRole('button', { name: '外观' }).click();
  const panel = page.getByRole('dialog', { name: '外观' });
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: /C 夜航/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-style', 'glass');
  await panel.getByRole('button', { name: '关闭' }).click();
  // 刷新后保持
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-style', 'glass');
});
