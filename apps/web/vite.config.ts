import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// Vite 开发服务器把 /api、/mcp 代理到本地 wrangler dev（见 docs/detailed/01-architecture.md#本地开发）
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@aikit/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8787', changeOrigin: true },
      '/mcp': { target: 'http://localhost:8787', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // E2E 便于阅读报错；上线可按需改回默认压缩
    minify: process.env.E2E_DEBUG ? false : undefined,
    sourcemap: !!process.env.E2E_DEBUG,
  },
});
