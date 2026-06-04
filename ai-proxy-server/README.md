# AI Proxy Server

AI 请求代理服务，基于 NestJS 构建。

## 功能

- 代理转发 AI API 请求（OpenAI / Claude 等）
- 统一管理 API Key，前端无需暴露密钥
- 支持流式响应 (SSE)
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

| 方法   | 路径              | 说明                     |
| ------ | ----------------- | ------------------------ |
| POST   | /api/ai/chat      | 通用聊天请求代理          |
| POST   | /api/ai/chat/stream | 流式聊天请求代理 (SSE)   |
| GET    | /api/ai/health    | 健康检查                 |
