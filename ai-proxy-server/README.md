# AI Proxy Server

AI 请求代理服务，基于 NestJS 构建。

## 功能

- 代理转发 AI API 请求（OpenAI / Claude 等）
- 统一管理 API Key，前端无需暴露密钥
- 支持 v2 结构化流式响应 (SSE)
- 请求日志记录

## 快速开始

```bash
# 安装依赖
pnpm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 填写 API Key

# 开发模式启动
pnpm start:dev
```

## API 端点

| 方法   | 路径                        | 说明 |
| ------ | --------------------------- | ---- |
| POST   | /api/ai/chat                | 非流式聊天代理，主要供后端内部能力复用 |
| POST   | /api/ai/chat/stream/v2      | 主聊天页流式协议，输出 `aiagent.stream.v2` 事件 |
| GET    | /api/ai/health              | 健康检查 |

## 流式协议约定

主业务只调用 `POST /api/ai/chat/stream/v2`。该端点由后端 adapter 统一屏蔽 OpenAI-compatible 上游差异，前端只消费 `message.part.*`、`message.completed`、`stream.completed`、`stream.failed` 等 v2 事件。
