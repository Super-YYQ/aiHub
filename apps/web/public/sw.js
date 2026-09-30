// Service Worker（04-frontend#PWA）：只缓存前端静态资源；
// /api 与 /mcp 一律走网络（离线数据由 Dexie 提供）；发现新版本时通知页面，由用户决定何时刷新。
const CACHE_VERSION = 'aikit-static-v1';
const PRECACHE = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      await Promise.allSettled(
        PRECACHE.map((url) => cache.add(new Request(url, { cache: 'reload' }))),
      );
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)));
      await self.clients.claim();
      // 新版本已接管：通知所有页面（页面提示“有新版本，刷新后生效”）
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) client.postMessage({ kind: 'sw-updated' });
    })(),
  );
});

self.addEventListener('message', (event) => {
  // 页面确认更新后让新版本立即接管
  if (event.data && event.data.kind === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // 接口一律走网络（04-frontend：/api 和 /mcp 不缓存）
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname === '/mcp' ||
    url.pathname.startsWith('/mcp/')
  ) {
    return;
  }
  const isNavigation =
    event.request.mode === 'navigate' || event.request.destination === 'document';
  // 同源 GET：缓存优先，后台回填；导航请求离线兜底到缓存的 /（SPA 离线可开）
  if (url.origin === self.location.origin && event.request.method === 'GET') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_VERSION);
        const cached = await cache.match(event.request);
        const network = fetch(event.request)
          .then((response) => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          })
          .catch(() => undefined);
        const hit = cached ?? (await network);
        if (hit) return hit;
        // 只有导航才回退到首页 HTML；其他资源（如 JS）失败就失败，不返回错误 MIME
        if (isNavigation) return (await cache.match('/')) ?? Response.error();
        return Response.error();
      })(),
    );
  }
});
