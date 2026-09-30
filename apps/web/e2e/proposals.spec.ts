import { test, expect } from '@playwright/test';

// WP14 验收（前端）：agent 提案 → 待确认页展示；接受/拒绝/批量；
// 修改后接受载入草稿。本地 E2E 用 X-Dev-Auth（development 专用）模拟 agent 角色。

const AGENT = { 'X-Dev-Auth': 'agent@example.com:agent' };

async function createProposal(request: any, body: unknown) {
  const res = await request.post('/api/proposals', {
    headers: { 'content-type': 'application/json', ...AGENT },
    data: body,
  });
  expect(res.status()).toBe(201);
  return (await res.json()) as { id: string };
}

test.beforeEach(async ({ request }) => {
  // 清掉历史 pending 提案，保证断言干净（直接拒绝所有 pending）
  const list = await request.get('/api/proposals?status=pending');
  const proposals = (await list.json()) as Array<{ id: string }>;
  for (const p of proposals) {
    await request.post(`/api/proposals/${p.id}/reject`, { data: { reason: '清理' } });
  }
});

test('待确认页：agent 提案展示、接受', async ({ page, request }) => {
  const { id } = await createProposal(request, {
    kind: 'create',
    draft: {
      type: 'tool',
      slug: `e2e-提案-${Date.now().toString(36)}`,
      title: 'E2E 提案的工具',
      summary: '由测试注入',
    },
    reason: '来自 ~/.claude/settings.json',
  });

  await page.goto('/proposals');
  const card = page.getByTestId('proposal-card').filter({ hasText: 'E2E 提案的工具' });
  await expect(card).toBeVisible({ timeout: 15000 });
  await expect(card).toContainText('新建');
  await expect(card).toContainText('来自 ~/.claude/settings.json');

  // 接受 → 卡片消失，条目入库
  await card.getByTestId(`proposal-accept-${id}`).click();
  await expect(page.getByText('已接受提案')).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('proposal-card')).toHaveCount(0, { timeout: 15000 });

  // 条目在全部列表里
  await page.goto('/list/all');
  await expect(page.getByText('E2E 提案的工具').first()).toBeVisible({ timeout: 15000 });
});

test('待确认页：拒绝与批量', async ({ page, request }) => {
  const { id: id1 } = await createProposal(request, {
    kind: 'create',
    draft: { type: 'tool', slug: `e2e-拒-${Date.now().toString(36)}`, title: '要拒绝的提案' },
  });
  const { id: id2 } = await createProposal(request, {
    kind: 'create',
    draft: { type: 'tool', slug: `e2e-批1-${Date.now().toString(36)}`, title: '批量接受甲' },
  });
  const { id: id3 } = await createProposal(request, {
    kind: 'create',
    draft: { type: 'tool', slug: `e2e-批2-${Date.now().toString(36)}`, title: '批量接受乙' },
  });

  await page.goto('/proposals');
  await expect(page.getByTestId('proposal-card')).toHaveCount(3, { timeout: 15000 });

  // 单条拒绝
  const rejectCard = page.getByTestId('proposal-card').filter({ hasText: '要拒绝的提案' });
  await rejectCard.getByTestId(`proposal-reject-${id1}`).click();
  await expect(page.getByText('已拒绝提案')).toBeVisible({ timeout: 10000 });

  // 勾选剩余两条 → 批量接受
  await page.getByTestId(`proposal-check-${id2}`).check();
  await page.getByTestId(`proposal-check-${id3}`).check();
  await page.getByTestId('bulk-accept').click();
  await expect(page.getByText(/已接受 2 条提案/)).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('proposal-card')).toHaveCount(0, { timeout: 15000 });
});

test('待确认页：修改后接受载入草稿', async ({ page, request }) => {
  await createProposal(request, {
    kind: 'create',
    draft: {
      type: 'prompt',
      slug: `e2e-改后-${Date.now().toString(36)}`,
      title: '修改后接受的草稿',
      summary: '会被用户改掉',
    },
  });

  await page.goto('/proposals');
  const card = page.getByTestId('proposal-card').filter({ hasText: '修改后接受的草稿' });
  await expect(card).toBeVisible({ timeout: 15000 });
  await card.getByRole('button', { name: '修改后接受' }).click();

  // 编辑页载入草稿
  const titleInput = page.getByTestId('entry-title');
  await expect(titleInput).toHaveValue('修改后接受的草稿', { timeout: 15000 });
  // 修改标题后保存 → 提案被接受
  await titleInput.fill('修改后接受的草稿（已改）');
  await page.getByTestId('save-button').click();
  // 保存 → 提案按修改后的内容落库，回到全部列表
  await expect(page).toHaveURL(/\/list\/all/, { timeout: 15000 });
  await page.goto('/proposals');
  await expect(page.getByTestId('proposal-card')).toHaveCount(0, { timeout: 15000 });
  // 修改后的条目在全部列表里
  await page.goto('/list/all');
  await expect(page.getByText('修改后接受的草稿（已改）').first()).toBeVisible({ timeout: 15000 });
});
