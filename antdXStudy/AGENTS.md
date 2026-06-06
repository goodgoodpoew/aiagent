# Ant Design X 练习项目

## 项目概述

基于 **Umi Max 4** + **Ant Design X 2.x** + **Redux Toolkit** 的全栈 AI 聊天前端。包含主聊天页（v2 流式协议）、模型管理、文件管理，以及各 `@ant-design/x` 组件的独立示例页。

## 技术栈

| 依赖 | 版本 | 用途 |
|------|------|------|
| @umijs/max | ^4.6 | 脚手架、路由、布局、request |
| @ant-design/x | ^2.7 | AI 交互组件 |
| @ant-design/x-sdk | ^2.7 | AI SDK |
| @ant-design/x-markdown | ^2.7 | Markdown 渲染 |
| @ant-design/x-card | ^2.7 | 卡片组件 |
| antd | ^6.4 | 基础 UI |
| @reduxjs/toolkit | ^2.12 | 状态管理 |
| react-redux | ^8.1 | React Redux 绑定 |
| react | ^18.2 | 视图层 |
| vitest | ^0.34 | 单元/组件测试 |
| @playwright/test | ^1.60 | E2E / 视觉回归 |
| pnpm | - | 包管理 |

## 目录结构

```
src/
├── app.ts                    # 根容器，注入 ReduxProvider + XProvider
├── layouts/index.tsx         # 侧边栏布局 + 菜单导航
├── pages/
│   ├── base/                 # 主业务页
│   │   ├── index.tsx         # 聊天页 (/ai/chat)
│   │   ├── models/           # 模型管理 (/ai/models)
│   │   ├── files/            # 文件管理 (/ai/files)
│   │   └── components/       # MessagePartsRenderer、AnswerProcessPanel 等
│   └── example/              # X 组件示例页
│       ├── bubble.tsx
│       ├── welcome.tsx
│       ├── prompt.tsx
│       ├── think.tsx
│       ├── suggestion.tsx
│       ├── sender.tsx
│       ├── markdown.tsx
│       ├── card.tsx
│       └── skill.tsx
├── store/                    # Redux Toolkit 状态管理
│   ├── index.ts              # store 配置与 typed hooks
│   ├── sessionStore/         # 会话列表与当前会话
│   ├── messageStore/         # 消息列表与流式事件
│   ├── contentStore/         # 输入框与附件草稿
│   ├── fileStore/            # 文件列表
│   ├── chatThunks.ts         # 聊天/会话异步逻辑
│   ├── fileThunks.ts         # 文件异步逻辑
│   ├── selectors.ts          # 派生状态选择器
│   └── adapters/             # API 响应归一化
├── service/                  # API 与协议层
│   ├── chat-stream-v2.ts     # v2 流式聊天 SSE 客户端
│   ├── stream-protocol.ts    # aiagent.stream.v2 协议类型
│   ├── session.ts            # 会话 CRUD
│   ├── session-events.ts     # 会话 SSE 事件订阅
│   ├── message.ts            # 消息查询
│   ├── file.ts               # 文件上传/管理
│   ├── platform.ts           # 模型供应商 API
│   ├── tool.ts               # 工具列表
│   └── request.ts            # 统一 HTTP 请求
test/
├── e2e/                      # Playwright E2E 测试
├── visual/                   # Playwright 视觉回归
├── mocks/                    # MSW mock handlers
└── setup.ts                  # vitest 全局 setup
.umirc.ts                     # 路由、proxy、插件配置
```

## 路由

| 路径 | 页面 | 说明 |
|------|------|------|
| `/ai/chat` | 主聊天页 | v2 结构化 SSE，Redux 驱动 |
| `/ai/models` | 模型管理 | 模型供应商 CRUD |
| `/ai/files` | 文件管理 | 文件上传与列表 |
| `/bubble` | 气泡 | `Bubble` / `Bubble.List` |
| `/welcome` | 欢迎 | `Welcome` |
| `/prompt` | 提示词 | `Prompts` |
| `/think` | 思考链 | `ThoughtChain` |
| `/suggestion` | 建议 | `Suggestion` |
| `/sender` | 发送框 | `Sender` |
| `/markdown` | Markdown | `XMarkdown` |
| `/card` | 卡片 | `XCard` |
| `/skill` | 技能 | `XSkill` |

默认重定向：`/` → `/ai/chat`

## 流式协议

主聊天页 `/ai/chat` 只使用 v2 结构化流式协议：

```text
POST http://localhost:3001/api/ai/chat/stream/v2
```

前端只消费 `aiagent.stream.v2` 的 `StreamEventEnvelope`，通过 `message.part.*`、`message.completed`、`stream.completed`、`stream.failed` 等事件驱动消息渲染。

数据流：

```
sendChatStreamV2 (chat-stream-v2.ts)
  → parseSseEvent 解析 SSE
    → chatThunks.applyStreamEvent 更新 messageStore
      → MessagePartsRenderer 按 part 类型渲染
```

会话级 SSE 订阅通过 `session-events.ts` 连接 `GET /api/sessions/events`，用于跨标签页会话同步。

## 常用命令

```bash
pnpm install          # 安装依赖
pnpm dev              # 开发服务器（max dev），默认 http://localhost:8000
pnpm build            # 生产构建
pnpm preview          # 预览构建产物
pnpm setup            # 生成 src/.umi 临时文件
pnpm test             # 运行全部 vitest 测试
pnpm test:unit        # 单元测试（service + store）
pnpm test:components  # 组件测试（pages）
pnpm test:e2e         # Playwright E2E 测试
pnpm test:visual      # Playwright 视觉回归测试
pnpm test:coverage    # 测试覆盖率
```

## 开发约定

1. **新增示例页**：在 `src/pages/` 新建组件 → `.umirc.ts` 的 `routes` 注册 → `src/layouts/index.tsx` 的 `menuItems` 同步添加（如需菜单可见）。
2. **全局 Provider**：`ReduxProvider` + `XProvider` 已在 `src/app.ts` 的 `rootContainer` 中挂载。
3. **聊天流式能力**：只维护 v2 协议（`chat-stream-v2.ts`、`stream-protocol.ts`、`chatThunks.ts`），不要重新引入旧的 OpenAI-like SSE 累积格式。
4. **状态管理**：业务状态走 Redux store + thunks，不要在组件内直接调用 API 后本地 setState 管理会话/消息。
5. **样式**：示例页统一使用 `maxWidth: 800` 居中 + `Card` 包裹，保持与现有页面一致。
6. **路径别名**：`@/` 指向 `src/`，`@@/` 指向 `src/.umi/`。
7. **语言**：代码注释、UI 文案、提交信息使用简体中文。

## 修改时注意

- 不要提交 `src/.umi`、`node_modules`、`dist`（已在 `.gitignore`）
- 修改路由后需重启 dev server
- 后端 API 通过 Umi proxy（`/api` → `localhost:3001`）或 service 层直连
- 当前 demo 用户 ID 硬编码在 `chat-stream-v2.ts` 中
- Ant Design X API 以 [官方文档](https://x.ant.design) 为准

## 参考链接

- [Ant Design X 文档](https://x.ant.design)
- [Umi Max 文档](https://umijs.org/docs/max/introduce)
- 仓库根目录 [AGENTS.md](../AGENTS.md) — 全栈架构与后端说明
