# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概览

本仓库包含两个关联子项目：

- **antdXStudy** — 前端，基于 Umi Max 4 + Ant Design X，AI 界面组件学习与演示
- **ai-proxy-server** — 后端，基于 NestJS，代理转发 AI API 请求（OpenAI / DeepSeek / Claude / Gemini）

前端通过 `ai-proxy-server` 调用 AI 平台，避免前端暴露 API Key。开发时需同时启动两个项目。

## 常用命令

### antdXStudy（前端）

```bash
cd antdXStudy
pnpm install          # 安装依赖
pnpm dev              # 开发服务器 (max dev)，默认 http://localhost:8000
pnpm build            # 生产构建
pnpm preview          # 预览构建产物
pnpm setup            # 生成 src/.umi 临时文件
```

### ai-proxy-server（后端）

```bash
cd ai-proxy-server
pnpm install          # 安装依赖
pnpm start:dev        # 开发模式 (NestJS --watch)，默认 http://localhost:3001
pnpm build            # 构建
pnpm start:prod       # 生产启动
pnpm lint             # ESLint 检查并自动修复
pnpm format           # Prettier 格式化
```

## 架构

### 请求链路

```
antdXStudy (Umi, :8000)
  │
  ├─ /api/* ──→ Umi proxy 转发到 ai-proxy-server (:3001)
  │                 │
  │                 └─→ OpenAI / DeepSeek / Claude / Gemini API
  │
  └─ src/service/chat-shared.ts 中的 CHAT_STREAM_API 直接请求 localhost:3001
```

Umi 框架层面配置了 `/api` 代理到 `localhost:3001`（见 `.umirc.ts`），同时 `chat-shared.ts` 中也是硬编码 `localhost:3001` 的流式端点。

### antdXStudy 结构

- **[src/app.ts](antdXStudy/src/app.ts)** — 入口，注入 `XProvider`（全局 AI 组件上下文）和导出 `request` 配置
- **[src/layouts/index.tsx](antdXStudy/src/layouts/index.tsx)** — 侧边栏布局 + 菜单导航，菜单项与路由一一对应
- **[src/pages/example/](antdXStudy/src/pages/example/)** — 各 `@ant-design/x` 组件的独立示例页，每个路由一个文件
- **[src/pages/base/](antdXStudy/src/pages/base/)** — 另一套 AI 聊天路由（`/ai/chat`），使用独立布局
- **[src/service/chat-shared.ts](antdXStudy/src/service/chat-shared.ts)** — Chat 页面的核心逻辑：定义消息类型、SSE 解析、`StreamChatProvider`（继承 `DefaultChatProvider`，将后端 SSE 格式转为 `@ant-design/x-sdk` 期望的格式）
- **`.umirc.ts`** — Umi 配置：路由表、proxy、antd/request/model 插件开关

### ai-proxy-server 结构

- **[src/main.ts](ai-proxy-server/src/main.ts)** — 启动入口，全局 CORS 配置
- **[src/app.module.ts](ai-proxy-server/src/app.module.ts)** — 根模块，加载 ConfigModule（全局）+ AiProxyModule
- **[src/ai-proxy/](ai-proxy-server/src/ai-proxy/)** — 核心代理模块
  - `ai-proxy.controller.ts` — 3 个端点：`POST /api/ai/chat`（非流式）、`POST /api/ai/chat/stream`（SSE 流式）、`GET /api/ai/health`
  - `ai-proxy.service.ts` — 平台配置映射 + 代理请求逻辑，支持 OpenAI / DeepSeek / Claude / Gemini / custom
  - `dto/chat.dto.ts` — `ChatRequestDto` 和 `ChatMessage` 类型定义
  - `utils/sse-transform.util.ts` — 将上游 SSE（delta 增量格式）转换为客户端所需的累积 message 格式
- **[src/common/guard/cors.guard.ts](ai-proxy-server/src/common/guard/cors.guard.ts)** — 全局 CORS 守卫
- **[src/config/configuration.ts](ai-proxy-server/src/config/configuration.ts)** — 环境变量配置映射

### SSE 数据流

```
上游 AI API (delta chunks)
  → pipeOpenAiStreamToClient (累积 delta content)
    → 输出 { choices: [{ message: { content: <累积>, role } }] } (SSE)
      → StreamChatProvider.transformMessage 解析 SSE data
        → Bubble.List 渲染
```

关键点：上游返回的是增量 delta，`sse-transform.util.ts` 将其累积后再输出；客户端 `chat-shared.ts` 的 `chatBubbleRole` 中又通过模块级变量 `currentContent` 做了二次累积拼接，确保 Bubble 显示完整文本。

## 开发约定

- 新增 antdXStudy 示例页：在 `src/pages/` 创建组件 → `.umirc.ts` 的 `routes` 注册 → `src/layouts/index.tsx` 的 `menuItems` 添加菜单项
- 代码注释、UI 文案、提交信息使用简体中文
- `@/` 别名指向 `src/`，`@@/` 指向 `src/.umi/`
- `.env` 文件包含真实 API Key，不要提交
- antdXStudy 的 `src/.umi/` 是自动生成的临时文件，不要手动修改
