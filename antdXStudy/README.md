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

`/chat` 和 `/sdk` 是 Ant Design X 学习示例，仍保留 v1 legacy 兼容层，用来验证 `useXChat` 和旧 `choices` SSE。新增主业务不要引用 legacy 示例代码。

## 示例页面

| 路由 | 组件 |
|------|------|
| `/ai/chat` | 主聊天页（v2 structured SSE） |
| `/ai/models` | 模型管理 |
| `/ai/files` | 文件管理 |
| `/chat` | legacy v1 示例（useXChat + 旧 SSE） |
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

## 迁移与回滚

- 主路径问题优先修复 v2：`src/service/chat-stream-v2.ts`、`src/service/stream-protocol.ts`、`src/store/chatThunks.ts`。
- 如需临时回滚观察旧示例，可访问 `/chat`；不要把 v1 `choices` 解析重新接回 `/ai/chat`。
