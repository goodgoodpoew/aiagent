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
| POST   | /api/ai/chat                | 通用聊天请求代理 |
| POST   | /api/ai/chat/stream/v2      | 主聊天页流式协议，输出 `aiagent.stream.v2` 事件 |
| POST   | /api/ai/chat/stream         | v1 legacy 流式协议，仅兼容旧示例和旧客户端 |
| GET    | /api/ai/health              | 健康检查 |

## 流式协议约定

主业务只应调用 `POST /api/ai/chat/stream/v2`。该端点由后端 adapter 统一屏蔽 OpenAI-compatible 上游差异，前端只消费 `message.part.*`、`stream.completed`、`stream.failed` 等 v2 事件。

`POST /api/ai/chat/stream` 暂时保留为 v1 legacy 回滚入口，响应中仍包含 `choices` 结构。新增业务不要依赖该结构。
