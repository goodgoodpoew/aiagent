import { defineConfig } from '@umijs/max';

export default defineConfig({
  title: 'Ant Design X 练习',
  esbuildMinifyIIFE: true,
  antd: {},
  model: {},
  request: {},
  proxy: {
    '/api': {
      target: 'http://localhost:3001',
      changeOrigin: true,
      pathRewrite: { '^/api': '' },
    },
  },
  routes: [
    {
      path: '/',
      title: '示例',
      routes: [
        { path: '', redirect: '/chat' },
        { path: '/chat', component: '@/pages/example/chat', title: 'Chat 聊天' },
        { path: '/bubble', component: '@/pages/example/bubble', title: 'Bubble 气泡' },
        { path: '/welcome', component: '@/pages/example/welcome', title: 'Welcome 欢迎' },
        { path: '/prompt', component: '@/pages/example/prompt', title: 'Prompt 提示' },
        { path: '/think', component: '@/pages/example/think', title: 'Think 思考' },
        { path: '/suggestion', component: '@/pages/example/suggestion', title: 'Suggestion 建议' },
        { path: '/sender', component: '@/pages/example/sender', title: 'Sender 发送' },
        { path: '/markdown', component: '@/pages/example/markdown', title: 'X Markdown' },
        { path: '/sdk', component: '@/pages/example/sdk', title: 'X SDK' },
        { path: '/card', component: '@/pages/example/card', title: 'X Card' },
        { path: '/skill', component: '@/pages/example/skill', title: 'X Skill' },
      ],
    },
    {
      path: '/ai',
      title: 'AI',
      routes: [
        { path: '', redirect: '/ai/chat' },
        { path: '/ai/chat', component: '@/pages/base', title: 'Chat 聊天' },
        { path: '/ai/models', component: '@/pages/base/models', title: '模型管理' },
        { path: '/ai/files', component: '@/pages/base/files', title: '文件管理' },
      ],
    }
  ],
  npmClient: 'pnpm',
});
