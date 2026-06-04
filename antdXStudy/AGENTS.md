# Ant Design X 练习项目

## 项目概述

基于 **Umi Max 4** + **Ant Design X 1.x** 的 AI 界面组件学习与演示项目。每个路由对应一个 `@ant-design/x` 组件的独立示例页。

## 技术栈

| 依赖 | 版本 | 用途 |
|------|------|------|
| @umijs/max | ^4.6 | 脚手架、路由、布局 |
| @ant-design/x | ^1.6 | AI 交互组件 |
| antd | ^5.28 | 基础 UI |
| react | ^18.2 | 视图层 |
| pnpm | - | 包管理（配置于 `.umirc.ts`） |

## 目录结构

```
src/
├── app.ts              # 根容器，注入 XProvider
├── layouts/index.tsx   # 侧边栏布局 + 菜单导航
└── pages/              # 各组件示例页（与路由一一对应）
    ├── chat.tsx        # useXAgent + useXChat 完整对话
    ├── bubble.tsx      # Bubble / Bubble.List
    ├── welcome.tsx     # Welcome
    ├── prompt.tsx      # Prompts
    ├── think.tsx       # ThoughtChain
    ├── suggestion.tsx  # Suggestion
    └── sender.tsx      # Sender
.umirc.ts               # 路由与 Umi 配置
```

## 路由

| 路径 | 页面 | 核心组件/Hook |
|------|------|---------------|
| `/chat` | 聊天演示 | `useXAgent`, `useXChat`, `Bubble.List`, `Sender` |
| `/bubble` | 气泡 | `Bubble`, `Bubble.List` |
| `/welcome` | 欢迎 | `Welcome` |
| `/prompt` | 提示词 | `Prompts` |
| `/think` | 思考链 | `ThoughtChain` |
| `/suggestion` | 建议 | `Suggestion` |
| `/sender` | 发送框 | `Sender` |

默认重定向：`/` → `/chat`

## 常用命令

```bash
pnpm install    # 安装依赖
pnpm dev        # 开发服务器（max dev）
pnpm build      # 生产构建
pnpm preview    # 预览构建产物
pnpm setup      # 生成 src/.umi 临时文件
```

## 开发约定

1. **新增示例页**：在 `src/pages/` 新建组件，并在 `.umirc.ts` 的 `routes` 与 `src/layouts/index.tsx` 的 `menuItems` 中同步注册。
2. **全局 Provider**：`XProvider` 已在 `src/app.ts` 的 `rootContainer` 中挂载，页面内直接使用 `@ant-design/x` 组件即可。
3. **样式**：示例页统一使用 `maxWidth: 800` 居中 + `Card` 包裹，保持与现有页面一致。
4. **模拟 AI**：`chat.tsx` 使用 `useXAgent` 的 `request` + `onUpdate` 模拟流式输出，无需真实 API。
5. **路径别名**：`@/` 指向 `src/`，`@@/` 指向 `src/.umi/`。
6. **语言**：代码注释、文档、提交信息使用简体中文。

## 修改时注意

- 不要提交 `src/.umi`、`node_modules`、`dist`（已在 `.gitignore`）
- 修改路由后需重启 dev server
- Ant Design X API 以 [官方文档](https://x.ant.design) 为准

## 参考链接

- [Ant Design X 文档](https://x.ant.design)
- [Umi Max 文档](https://umijs.org/docs/max/introduce)
