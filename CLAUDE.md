# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概览

本仓库是一个全栈 AI 聊天应用，包含两个关联子项目：

- **antdXStudy** — 前端，基于 Umi Max 4 + Ant Design X 2.x + Redux Toolkit，提供 AI 聊天、模型管理、文件管理及 X 组件示例页
- **ai-proxy-server** — 后端，基于 NestJS + Prisma + PostgreSQL + Redis，负责 AI 代理、会话持久化、流式 v2 协议、模型供应商管理、文件上传与 Agent Runtime

前端通过 `ai-proxy-server` 调用 AI 平台，避免前端暴露 API Key。开发时需同时启动 PostgreSQL、Redis、后端与前端。

## 常用命令

### antdXStudy（前端）

```bash
cd antdXStudy
pnpm install              # 安装依赖
pnpm dev                  # 开发服务器 (max dev)，默认 http://localhost:8000
pnpm build                # 生产构建
pnpm preview              # 预览构建产物
pnpm setup                # 生成 src/.umi 临时文件
pnpm test                 # 运行全部 vitest 测试
pnpm test:unit            # 单元测试（service + store）
pnpm test:components      # 组件测试（pages）
pnpm test:e2e             # Playwright E2E 测试
pnpm test:visual          # Playwright 视觉回归测试
pnpm test:coverage        # 测试覆盖率
```

### ai-proxy-server（后端）

```bash
cd ai-proxy-server
pnpm install              # 安装依赖
docker compose up -d      # 启动 PostgreSQL + Redis（开发依赖）
pnpm prisma generate      # 生成 Prisma Client
pnpm prisma migrate dev   # 开发环境数据库迁移
pnpm prisma migrate deploy # 生产/CI 环境迁移
pnpm prisma db seed       # 写入种子数据（模型供应商等）
pnpm start:dev            # 开发模式 (NestJS --watch)，默认 http://localhost:3001
pnpm build                # 构建
pnpm start:prod           # 生产启动
pnpm lint                 # ESLint 检查并自动修复
pnpm format               # Prettier 格式化
pnpm test                 # 运行全部 jest 测试
pnpm test:unit            # 单元测试
pnpm test:integration     # 集成测试（需数据库）
pnpm test:e2e             # E2E 测试
pnpm test:coverage        # 测试覆盖率
pnpm test:env:up          # 启动 Docker 测试环境（postgres + redis）
pnpm test:env:down        # 停止 Docker 测试环境
pnpm test:db:migrate      # 在测试环境中执行迁移
```

## 架构

```mermaid
flowchart LR
  FE["antdXStudy (Umi :8000)\nRedux Toolkit + Ant Design X 2.x"]
  BE["ai-proxy-server (NestJS :3001)"]
  PG[("PostgreSQL (Prisma)")]
  RD[("Redis (cache/queue/throttle)")]
  UP["上游 AI 平台\nOpenAI/DeepSeek/Claude/Gemini"]
  FE -->|"/api 代理 + SSE v2"| BE
  BE --> PG
  BE --> RD
  BE -->|stream adapter| UP
```

### 请求链路

```
antdXStudy (Umi, :8000)
  │
  ├─ /api/* ──→ Umi proxy 转发到 ai-proxy-server (:3001)
  │                 │
  │                 ├─→ PostgreSQL（会话/消息/文件/模型供应商）
  │                 ├─→ Redis（缓存/队列/限流）
  │                 └─→ 上游 AI API
  │
  ├─ chat-stream-v2.ts 直连 http://localhost:3001/api/ai/chat/stream/v2（SSE）
  └─ session-events.ts  直连 http://localhost:3001/api/sessions/events（SSE）
```

Umi 在 [`.umirc.ts`](antdXStudy/.umirc.ts) 配置了 `/api` 代理到 `localhost:3001`（`pathRewrite: { '^/api': '' }`）。流式聊天与会话事件 SSE 在 service 层直连后端，请求头携带 `X-User-Id`（当前前端硬编码 demo 用户 ID）。

### antdXStudy 结构

- **[src/app.ts](antdXStudy/src/app.ts)** — 入口，注入 `ReduxProvider` + `XProvider`，导出 `request` 配置
- **[src/layouts/index.tsx](antdXStudy/src/layouts/index.tsx)** — 侧边栏布局 + 菜单导航
- **[src/pages/base/](antdXStudy/src/pages/base/)** — 主业务页：聊天（`/ai/chat`）、模型管理（`/ai/models`）、文件管理（`/ai/files`）
- **[src/pages/example/](antdXStudy/src/pages/example/)** — 各 `@ant-design/x` 组件独立示例页
- **[src/store/](antdXStudy/src/store/)** — Redux Toolkit 多 slice 状态管理
  - `sessionStore` — 会话列表与当前会话
  - `messageStore` — 消息列表与流式事件应用
  - `contentStore` — 输入框与附件草稿
  - `fileStore` — 文件列表
  - `chatThunks.ts` / `fileThunks.ts` — 异步业务逻辑
  - `adapters/` — API 响应到 store 的归一化
- **[src/service/](antdXStudy/src/service/)** — API 与协议层
  - `chat-stream-v2.ts` — v2 流式聊天 SSE 客户端
  - `stream-protocol.ts` — `aiagent.stream.v2` 协议类型定义
  - `session.ts` / `session-events.ts` — 会话 CRUD 与 SSE 订阅
  - `message.ts` / `file.ts` / `platform.ts` / `tool.ts` — 各资源 API
  - `request.ts` — 统一 HTTP 请求封装
- **[`.umirc.ts`](antdXStudy/.umirc.ts)** — 路由表、proxy、antd/request/model 插件

### ai-proxy-server 结构

- **[src/main.ts](ai-proxy-server/src/main.ts)** — 启动入口，全局 ValidationPipe + CORS
- **[src/app.module.ts](ai-proxy-server/src/app.module.ts)** — 根模块，注册全局 Filter/Interceptor/Guard + 各业务 Module
- **[src/ai-proxy/](ai-proxy-server/src/ai-proxy/)** — 聊天 HTTP 端点、非流式代理、stream-failure 协调、会话标题队列
- **[src/streaming/](ai-proxy-server/src/streaming/)** — 流式 v2 协议核心
  - `protocol/message-part.types.ts` — 消息分片类型
  - `protocol/stream-event-writer.ts` — SSE 事件写出
  - `services/stream-orchestrator.service.ts` — 流式编排入口
  - `services/stream-message-builder.service.ts` — 上游 chunk 到 message-part 转换
  - `adapters/openai-compatible-stream.adapter.ts` — OpenAI 兼容上游适配
- **[src/agent-runtime/](ai-proxy-server/src/agent-runtime/)** — Agent 运行时
  - `agent-runtime-runner.service.ts` — 运行编排
  - `agent-runtime-event-projector.service.ts` — 运行时事件投影到 SSE
  - `engines/native-agent-engine.service.ts` — 原生引擎实现
  - `adapters/langgraph-agent-engine.adapter.ts` — LangGraph 适配
  - `gateways/default-tool-gateway.service.ts` — 工具调用网关
  - `ports/` — 引擎/工具/检查点抽象接口
- **[src/session/](ai-proxy-server/src/session/)** — 会话 CRUD、SSE 事件推送、文件关联
- **[src/message/](ai-proxy-server/src/message/)** — 消息持久化与查询
- **[src/conversation/](ai-proxy-server/src/conversation/)** — 会话应用层编排
- **[src/model-provider/](ai-proxy-server/src/model-provider/)** — 模型供应商、凭证加密、模型配置 CRUD
- **[src/platform/](ai-proxy-server/src/platform/)** — 兼容旧 `/api/platforms` 路由（转发到 model-provider）
- **[src/files/](ai-proxy-server/src/files/)** — 文件上传、解析（PDF 等）、本地存储
- **[src/tools/](ai-proxy-server/src/tools/)** — 可用工具列表
- **[src/prisma/](ai-proxy-server/src/prisma/)** — Prisma 模块与服务
- **[src/redis/](ai-proxy-server/src/redis/)** — Redis 连接
- **[src/queue/](ai-proxy-server/src/queue/)** — BullMQ 异步任务（如会话标题生成）
- **[src/throttle/](ai-proxy-server/src/throttle/)** — 基于 Redis 的速率限制
- **[src/common/](ai-proxy-server/src/common/)** — 横切关注点
  - `filters/global-exception.filter.ts` — 全局异常处理
  - `interceptors/response-envelope.interceptor.ts` — 统一响应信封 `{ code, data, message }`
  - `guard/cors.guard.ts` — CORS 守卫
  - `middleware/request-id.middleware.ts` — 请求 ID 注入
- **[src/config/configuration.ts](ai-proxy-server/src/config/configuration.ts)** — 环境变量映射
- **[prisma/schema.prisma](ai-proxy-server/prisma/schema.prisma)** — 数据库模型定义

## API 端点

| 前缀 | 主要端点 | 说明 |
|------|---------|------|
| `api/ai` | `POST chat`、`POST chat/stream/v2`、`GET health` | AI 聊天与健康检查 |
| `api/sessions` | `POST /`、`GET /`、`GET events`（SSE）、`GET :id`、`GET :id/messages`、`PATCH :id`、`POST :id/files`、`GET :id/files`、`DELETE :id` | 会话管理 |
| `api/files` | `GET /`、`POST upload`、`GET :id`、`GET :id/content`、`GET :id/download`、`DELETE :id` | 文件管理 |
| `api/model-providers` | CRUD + 凭证/模型子资源 | 模型供应商管理 |
| `api/platforms` | 同 model-providers（兼容旧路由） | 平台管理别名 |
| `api/tools` | `GET /` | 可用工具列表 |

注意：SSE 端点（`chat/stream/v2`、`sessions/events`）使用 `@SkipResponseEnvelope()`，不走统一响应信封。

## 数据模型

基于 Prisma + PostgreSQL，核心模型：

| 模型 | 说明 |
|------|------|
| `User` | 用户 |
| `Session` | 聊天会话（含 title、version、软删除） |
| `ChatRequest` | 单次聊天请求追踪（幂等 requestId） |
| `Message` | 消息（role、content、metadata） |
| `ModelProvider` | AI 平台配置（baseUrl、adapterType） |
| `ModelProviderCredential` | 加密存储的平台凭证 |
| `ProviderModel` | 平台下的可用模型 |
| `UploadedFile` | 上传文件记录 |
| `SessionFile` | 会话与文件的归档关联（文件在该会话出现过） |
| `MessageFile` | 消息与文件的事实关联（该消息发送时模型实际可读取的文件） |

`SessionFile` 与 `MessageFile` 语义不同：前者是归档关系，后者决定模型上下文。

## 流式 v2 协议

主聊天页只使用 `aiagent.stream.v2` 协议：

```
上游 AI API (delta chunks)
  → openai-compatible-stream.adapter（适配上游格式）
    → stream-message-builder（构建 message-part 分片）
      → agent-runtime-event-projector（投影运行时事件）
        → stream-event-writer（写出 SSE event:/data:）
          → 前端 parseSseEvent 解析
            → chatThunks.applyStreamEvent 更新 messageStore
              → MessagePartsRenderer 渲染
```

关键事件类型：`message.part.*`、`message.completed`、`stream.completed`、`stream.failed`。

前端协议类型定义在 [stream-protocol.ts](antdXStudy/src/service/stream-protocol.ts)，后端对应 [message-part.types.ts](ai-proxy-server/src/streaming/protocol/message-part.types.ts)。

## 环境变量

后端 `.env` 参考 [`.env.example`](ai-proxy-server/.env.example)，常用变量：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 服务端口 | `3001` |
| `DATABASE_URL` | PostgreSQL 连接串 | 开发: `postgresql://aichat:aichat_dev@localhost:5432/aichat` |
| `OPENAI_API_KEY` | OpenAI Key | — |
| `DEEPSEEK_API_KEY` | DeepSeek Key | — |
| `CLAUDE_API_KEY` | Claude Key | — |
| `GEMINI_API_KEY` | Gemini Key | — |
| `MODEL_CREDENTIAL_SECRET` | 模型凭证加密密钥 | 开发有 fallback |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` / `REDIS_DB` / `REDIS_KEY_PREFIX` | Redis 配置 | `localhost:6379` |
| `CACHE_TTL_CHAT` / `CACHE_TTL_SESSION` | 缓存 TTL（秒） | `300` / `3600` |
| `THROTTLE_TTL` / `THROTTLE_LIMIT` | 限流配置 | `60000` / `20` |
| `FILE_MAX_SIZE` / `FILE_MAX_ATTACHMENTS_PER_MESSAGE` | 文件限制 | `10MB` / `5` |
| `UPLOAD_ROOT` | 文件存储根目录 | `uploads` |
| `AI_PROVIDER_MODE` | AI 提供商模式（测试用 `mock`） | — |

`.env` 包含真实 API Key，不要提交。

## 测试

### 后端

- **unit** — 纯逻辑测试，无需外部依赖
- **integration** — 需要 PostgreSQL + Redis（CI 用 GitHub Actions services，本地可用 `pnpm test:env:up`）
- **e2e** — 端到端测试
- CI 流程见 [.github/workflows/backend-tests.yml](.github/workflows/backend-tests.yml)：lint → build → unit → migrate deploy → integration
- 测试环境变量参考 [test/env/.env.test.example](ai-proxy-server/test/env/.env.test.example)

### 前端

- **vitest** — 单元/组件测试（`src/service`、`src/store`、`src/pages`）
- **playwright** — E2E 与视觉回归（`test/e2e`、`test/visual`）
- MSW mock 在 `test/mocks/`

## 开发约定

- 新增 antdXStudy 示例页：在 `src/pages/` 创建组件 → [`.umirc.ts`](antdXStudy/.umirc.ts) 的 `routes` 注册 → [`src/layouts/index.tsx`](antdXStudy/src/layouts/index.tsx) 的 `menuItems` 添加菜单项
- 新增后端模块：创建 Module → 在 [`app.module.ts`](ai-proxy-server/src/app.module.ts) 的 `imports` 注册
- 聊天流式能力只维护 v2 协议，不要重新引入旧的 OpenAI-like SSE 累积格式
- 代码注释、UI 文案、提交信息使用简体中文
- `@/` 别名指向 `src/`，`@@/` 指向 `src/.umi/`
- `.env` 文件包含真实 API Key，不要提交
- antdXStudy 的 `src/.umi/` 是自动生成的临时文件，不要手动修改
- 设计文档与规划在仓库根目录 [`docs/`](docs/) 下
