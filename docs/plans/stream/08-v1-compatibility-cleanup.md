# 08 v1 兼容层收口与迁移清理计划

> 执行标注（2026-06-04）：已执行。主聊天页 `/ai/chat` 只调用 `sendChatStreamV2()` 和 `POST /api/ai/chat/stream/v2`；v1 后端端点继续保留为 legacy；前端 v1 `sendChatStream()` 主业务入口已删除；Ant Design X 示例兼容层已从 `src/service/chat-shared.ts` 移到 `src/pages/example/chat-shared.ts`，避免 `src/service` 继续承载 `choices` 解析。

## 动机

v2 文本、持久化、错误状态、reasoning 和工具能力稳定后，v1 流式协议只应保留在示例或兼容入口中。继续让主业务同时维护 v1/v2，会增加测试负担，也容易让 `choices` 结构重新泄漏到业务代码。

本计划负责收口 v1 兼容层、清理主业务路径和补齐迁移文档。

## 修改原因

- v1 `query + choices + delta` 不适合承载后续工具和 reasoning。
- 主聊天页应只有一套流式协议。
- 示例页和学习代码可以保留 v1，但需要明确边界。
- 删除旧路径前需要确保回滚和迁移说明完整。

## 修改位置

后端：

- `ai-proxy-server/src/ai-proxy/ai-proxy.controller.ts`
- `ai-proxy-server/src/ai-proxy/utils/sse-transform.util.ts`
- `ai-proxy-server/src/ai-proxy/dto/chat-stream.dto.ts`
- `ai-proxy-server/README.md`

前端：

- `antdXStudy/src/service/chat.ts`
- `antdXStudy/src/pages/example/chat-shared.ts`（执行阶段从 `src/service/chat-shared.ts` 迁移而来）
- `antdXStudy/src/store/chatThunks.ts`
- `antdXStudy/src/pages/example/chat.tsx`
- `antdXStudy/README.md`

文档：

- `docs/unified-streaming-io-protocol-plan.md`
- `docs/plans/README.md`

## 目标

- 主聊天页只使用 v2。
- v1 只保留给 Ant Design X 示例页或明确标注为 legacy。
- 删除主业务路径中对 `choices` 的依赖。
- 更新 README 和开发说明。
- 建立 v1 下线条件。

## 实施方案

1. 标注 legacy：

- [x] `ChatStreamDto` 注释标记为 v1 legacy。
- [x] `pipeOpenAiStreamToClient()` 注释标记为 v1 legacy。
- [x] `chat-shared.ts` 注释标记为 Ant Design X 示例兼容层。
- [x] `POST /api/ai/chat/stream` controller 增加 v1 legacy 注释。

2. 主业务清理：

- [x] `chatThunks.ts` 不再引用 v1 `sendChatStream()`。
- [x] `messageStore` 中 v1 专用 `appendAssistantDelta` 已无使用并删除。
- [x] 主聊天页只导入 `sendChatStreamV2()`。
- [x] `/ai/chat` 文件上传从 `service/chat.ts` 拆到 `service/file.ts`，避免主业务间接依赖 v1 service。
- [x] 未被示例引用的 `antdXStudy/src/service/chat.ts` 已删除。

3. 示例保留：

- [x] `/chat`、`/sdk` 等示例页继续使用 v1 兼容层。
- [x] 示例页标题和 README 说明 v1 是历史兼容示例。
- [x] 根路径默认跳转改为 `/ai/chat`，避免默认进入 legacy v1 示例。

4. 文档更新：

- [x] README 写明主协议是 `POST /api/ai/chat/stream/v2`。
- [x] 说明 v1 端点仅兼容旧示例。
- [x] 补充迁移和回滚策略。

5. 下线条件：

- [x] v2 在主聊天页稳定覆盖文本、附件、错误。（执行检查：主路径已只走 v2；仍需人工端到端回归）
- [x] v2 支持当前项目所需 provider。（执行检查：走后端 provider registry + openai-compatible adapter）
- [ ] 示例页已迁移或明确不再需要 v1。
- [ ] 测试覆盖 v2 主路径。

## 产出

- 主业务只走 v2。
- v1 legacy 标注。
- README 和 docs 更新。
- 已删除未使用的 v1 前端主业务代码。
- v1 下线清单。

## 验收

- `rg "choices" antdXStudy/src/store antdXStudy/src/pages/base antdXStudy/src/service` 不再在主业务路径命中 v1 解析逻辑。
  - 执行标注：原计划同时要求 `chat-shared.ts` 保留在 `src/service`，这会导致验收命令误报；本次已将 legacy 示例兼容层迁到 `src/pages/example/chat-shared.ts`。
  - 验证结果：已通过，命令无命中。
- 主聊天页新建会话、既有会话、附件、错误场景都走 v2。
- 示例页如果仍使用 v1，功能不受影响。
- README 明确 v2 是主流式协议。
- 前后端构建通过。
  - 验证结果：`antdXStudy pnpm build` 通过；`ai-proxy-server pnpm build` 通过。
- 没有删除用户仍在使用的示例功能。

## 风险与注意事项

- 不要在 v2 未稳定前删除 v1 endpoint。
- 如果删除 v1 前端代码，要确认示例页没有引用。
- v1 后端可以比前端更晚下线，给外部调用留缓冲。
- 清理时不要改动 `.env` 或任何 API Key 配置。

## v1 下线清单

- [ ] `/chat`、`/sdk` 示例页迁移到 v2 event envelope，或确认这些学习示例可以删除。
- [ ] 后端访问日志确认没有外部客户端继续调用 `POST /api/ai/chat/stream`。
- [ ] 删除 `ChatStreamDto`、`pipeOpenAiStreamToClient()`、v1 controller 方法和示例兼容层。
- [ ] 更新 README、计划索引和统一协议文档，移除 v1 回滚说明。
- [ ] 前后端构建与主聊天页端到端回归通过。
