import { createRouter, createWebHistory } from 'vue-router';

// 路由与结构无关：同一个网址在任何结构下都打开同一个页面或条目（04-frontend#路由）。
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: () => import('./pages/HomePage.vue') },
    {
      path: '/list/:scope/:id?',
      name: 'list',
      component: () => import('./pages/ListPage.vue'),
    },
    {
      path: '/new/:type?',
      name: 'new',
      component: () => import('./pages/EntryEditPage.vue'),
    },
    { path: '/edit/:id', name: 'edit', component: () => import('./pages/EntryEditPage.vue') },
    { path: '/stacks', name: 'stacks', component: () => import('./pages/StacksPage.vue') },
    {
      path: '/stacks/new',
      name: 'stack-new',
      component: () => import('./pages/StackEditPage.vue'),
    },
    { path: '/stacks/:id', name: 'stack', component: () => import('./pages/StackPage.vue') },
    {
      path: '/stacks/:id/edit',
      name: 'stack-edit',
      component: () => import('./pages/StackEditPage.vue'),
    },
    { path: '/proposals', name: 'proposals', component: () => import('./pages/ProposalsPage.vue') },
    { path: '/settings', name: 'settings', component: () => import('./pages/SettingsPage.vue') },
    {
      path: '/settings/types',
      name: 'settings-types',
      component: () => import('./pages/SettingsTypesPage.vue'),
    },
    {
      path: '/settings/platforms',
      name: 'settings-platforms',
      component: () => import('./pages/SettingsPlatformsPage.vue'),
    },
    {
      path: '/settings/tags',
      name: 'settings-tags',
      component: () => import('./pages/SettingsTagsPage.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('./pages/NotFoundPage.vue'),
    },
  ],
});
