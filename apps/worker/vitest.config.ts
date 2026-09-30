import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';

// pool-workers 0.22+（vitest 4）：cloudflareTest 插件取代 defineWorkersConfig。
// 鉴权测试里通过覆盖 globalThis.fetch 模拟 JWKS（见 test/auth.test.ts），
// 测试与被测 Worker 同一 isolate，全局 mock 对两者都生效。
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
        // 测试配置：指向 fixtures 的团队域名/AUD/白名单/服务令牌角色
        configPath: './wrangler.test.jsonc',
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
