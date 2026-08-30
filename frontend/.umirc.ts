import { defineConfig } from '@umijs/max';

export default defineConfig({
  title: 'Times',
  favicons: ['/favicon.svg'],
  hash: true,
  esbuildMinifyIIFE: true,
  mfsu: false,
  fastRefresh: false,
  routes: [
    { path: '/login', component: '@/pages/login' },
    {
      path: '/',
      routes: [
        { path: '/', redirect: '/events' },
        { path: '/events', component: '@/pages/events' },
        { path: '/events/new', component: '@/pages/events/new' },
        { path: '/events/edit/:id', component: '@/pages/events/new' },
        { path: '/statistics', component: '@/pages/statistics' },
        { path: '/admin/users', component: '@/pages/admin/users' },
        { path: '/admin/categories', component: '@/pages/admin/categories' },
        { path: '/admin/statistics', component: '@/pages/admin/statistics' }
      ]
    },
    { path: '*', redirect: '/events' }
  ],
  proxy: {
    '/api': { target: 'http://127.0.0.1:8080', changeOrigin: true }
  }
});
