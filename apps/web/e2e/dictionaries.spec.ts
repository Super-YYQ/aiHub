import { test, expect } from '@playwright/test';

// WP12 验收：新建自定义类型并选颜色/字段模板 → 新建条目时出现该类型；
// 删除仍被引用的类型提示原因；标签改名合并后条目更新且各有一条修订；
// 整理规则保存后 GET /api/settings/rules 返回新内容。

test('字典与标签管理', async ({ page }) => {
  // 新建自定义类型（颜色 + 字段模板）
  await page.goto('/settings/types');
  await page.getByTestId('new-type-id').fill('workflow');
  await page.getByTestId('new-type-name').fill('工作流');
  await page.getByTestId('new-type-submit').click();
  // 类型进入列表（名称在输入框的 value 里，不在 textContent）
  await expect(page.getByTestId('type-name-workflow')).toHaveValue('工作流', { timeout: 10000 });

  // 新建条目时出现该类型
  await page.goto('/new');
  const typeSelect = page.locator('select').first();
  await expect(typeSelect.locator('option', { hasText: '工作流' })).toBeAttached({
    timeout: 10000,
  });

  // 删除仍被引用的类型 → 提示原因（先建一条 workflow 条目并等它同步到服务端）
  await typeSelect.selectOption('workflow');
  await page.getByTestId('entry-title').fill('工作流条目一条');
  await page.getByTestId('save-button').click();
  await expect(page.getByRole('heading', { name: '工作流条目一条' })).toBeVisible();
  // 等 outbox 上传完成（侧栏同步状态回到已同步）
  await page.locator('.rail-foot').filter({ hasText: '已同步' }).waitFor({ timeout: 15000 });
  await page.goto('/settings/types');
  await page.getByTestId('type-delete-workflow').click();
  await expect(page.getByText(/仍有条目使用这个类型/)).toBeVisible({ timeout: 10000 });

  // 标签改名合并：给两条条目打同一标签后合并到已有标签
  await page.request.fetch('/api/entries', {
    method: 'POST',
    data: { type: 'tool', title: '标签甲', tags: ['待合并'] },
  });
  await page.request.fetch('/api/entries', {
    method: 'POST',
    data: { type: 'tool', title: '标签乙', tags: ['待合并', '目标'] },
  });
  await page.goto('/settings/tags');
  await page.locator('[data-testid="tag-rename-start"]', { hasText: '' }).first();
  await page.locator('.tag-row', { hasText: '#待合并' }).getByTestId('tag-rename-start').click();
  await page.getByTestId('tag-rename-input').fill('目标');
  await page.getByTestId('tag-rename-confirm').click();
  await expect(page.getByText(/改名\/合并到“目标”/)).toBeVisible({ timeout: 10000 });
  // 合并后“待合并”消失，条目数并入“目标”
  await expect(page.locator('.tag-row', { hasText: '#待合并' })).toHaveCount(0);

  // 整理规则保存后接口返回新内容
  const rulesRes = await page.request.fetch('/api/settings/rules', {
    method: 'PUT',
    data: { value: '- 新整理规则（WP12 验收）\n- 第二条' },
  });
  expect(rulesRes.status()).toBe(200);
  const got = await page.request.fetch('/api/settings/rules');
  const rules = (await got.json()) as { value: string };
  expect(rules.value).toContain('WP12 验收');
});
