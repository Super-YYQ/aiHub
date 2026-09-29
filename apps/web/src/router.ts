import { createRouter, createWebHistory } from 'vue-router';

// 占位路由（WP7 起替换为完整路由表，见 docs/detailed/04-frontend.md#路由）
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('./pages/HomePage.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('./pages/HomePage.vue'),
    },
  ],
});
