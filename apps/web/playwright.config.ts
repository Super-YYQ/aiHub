import { defineConfig, devices } from '@playwright/test';

// 端到端测试（WP7 验收）：桌面 1440×900 与手机 390×844 两种视口。
// 直接对 wrangler dev（构建后的前端 + 本地 D1 + 种子）测试，与生产拓扑一致。
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:8787',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    {
      name: 'mobile',
      use: { viewport: { width: 390, height: 844 }, ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'node ../worker/scripts/dev-e2e.mjs',
    url: 'http://127.0.0.1:8787/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
