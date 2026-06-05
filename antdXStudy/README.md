# Ant Design X 练习

基于 Umi Max 的 Ant Design X 组件学习与演示项目。

## 快速开始

```bash
pnpm install
pnpm dev
```

浏览器访问 http://localhost:8000 ，默认进入 `/ai/chat` 主聊天页。

## 流式协议

主聊天页 `/ai/chat` 只使用 v2 结构化流式协议：

```text
POST http://localhost:3001/api/ai/chat/stream/v2
```

前端只消费 `aiagent.stream.v2` 的 `StreamEventEnvelope`，并通过 `message.part.*`、`message.completed`、`stream.completed`、`stream.failed` 等事件驱动消息渲染。

## 示例页面

| 路由 | 组件 |
|------|------|
| `/ai/chat` | 主聊天页（v2 structured SSE） |
| `/ai/models` | 模型管理 |
| `/ai/files` | 文件管理 |
| `/bubble` | 消息气泡 |
| `/welcome` | 欢迎页 |
| `/prompt` | 提示词列表 |
| `/think` | 思考链 |
| `/suggestion` | 快捷建议 |
| `/sender` | 消息发送框 |

## 脚本

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 启动开发服务器 |
| `pnpm build` | 生产构建 |
| `pnpm preview` | 预览构建结果 |
| `pnpm setup` | 生成 Umi 临时文件 |

## 技术栈

- [Umi Max](https://umijs.org/docs/max/introduce)
- [Ant Design X](https://x.ant.design)
- [Ant Design](https://ant.design)
- React 18 + TypeScript

## 开发约定

- 聊天流式能力只维护 v2：`src/service/chat-stream-v2.ts`、`src/service/stream-protocol.ts`、`src/store/chatThunks.ts`。
- 新增聊天相关能力时只接入 `aiagent.stream.v2`，不要重新引入旧的 OpenAI-like SSE 响应解析。
