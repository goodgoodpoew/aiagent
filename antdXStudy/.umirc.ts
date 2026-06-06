import { defineConfig } from '@umijs/max';

const apiProxyTarget = process.env.API_PROXY_TARGET || 'http://localhost:3001';

export default defineConfig({
  title: 'Ant Design X 练习',
  metas: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
  esbuildMinifyIIFE: true,
  antd: {},
  model: {},
  request: {},
  proxy: {
    '/api': {
      target: apiProxyTarget,
      changeOrigin: true,
      pathRewrite: { '^/api': '' },
    },
  },
  routes: [
    {
      path: '/login',
      component: '@/pages/login',
      title: '登录',
    },
    {
      path: '/',
      title: '示例',
      routes: [
        { path: '', redirect: '/ai/chat' },
        {
          path: '/bubble',
          component: '@/pages/example/bubble',
          title: 'Bubble 气泡',
        },
        {
          path: '/welcome',
          component: '@/pages/example/welcome',
          title: 'Welcome 欢迎',
        },
        {
          path: '/prompt',
          component: '@/pages/example/prompt',
          title: 'Prompt 提示',
        },
        {
          path: '/think',
          component: '@/pages/example/think',
          title: 'Think 思考',
        },
        {
          path: '/suggestion',
          component: '@/pages/example/suggestion',
          title: 'Suggestion 建议',
        },
        {
          path: '/sender',
          component: '@/pages/example/sender',
          title: 'Sender 发送',
        },
        {
          path: '/markdown',
          component: '@/pages/example/markdown',
          title: 'X Markdown',
        },
        { path: '/card', component: '@/pages/example/card', title: 'X Card' },
        {
          path: '/skill',
          component: '@/pages/example/skill',
          title: 'X Skill',
        },
      ],
    },
    {
      path: '/ai',
      title: 'AI',
      routes: [
        { path: '', redirect: '/ai/chat' },
        { path: '/ai/chat', component: '@/pages/base', title: 'Chat 聊天' },
        {
          path: '/ai/models',
          component: '@/pages/base/models',
          title: '模型管理',
        },
        {
          path: '/ai/files',
          component: '@/pages/base/files',
          title: '文件管理',
        },
      ],
    },
  ],
  npmClient: 'pnpm',
});
