import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';

// pool-workers 0.22+（vitest 4）：cloudflareTest 插件取代 defineWorkersConfig。
// 选项经 unstable_getMiniflareWorkerOptions 从 wrangler.jsonc 读取绑定。
export default defineConfig({
  resolve: {
    alias: {
      '@aikit/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
    },
  },
  plugins: [
    cloudflareTest({
      wrangler: {
        configPath: './wrangler.jsonc',
      },
      miniflare: {
        // pool-workers 内置的 workerd（1.20260815）只支持到 2026-08-22；
        // wrangler dev 用更新的 workerd，两者不要强行对齐。
        compatibilityDate: '2026-08-22',
      },
    }),
  ],
  test: {
    globals: true,
    passWithNoTests: true,
  },
});
