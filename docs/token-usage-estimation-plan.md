# 后端 Token 消耗估算计划

## Summary

第一版只覆盖当前主用的 v2 流式聊天链路，在后端封装可扩展的 token 估算服务，用简单规则估算每轮对话的 `promptTokens`、`completionTokens`、`totalTokens`，并在 assistant 消息完成时写入现有 `Message.metadata.usage`。

本方案不改前端、不改 Prisma schema、不引入真实 tokenizer 依赖。token 数值仅作为估算值，用于展示、审计和后续成本统计基础。

## Key Changes

- 新增 `TokenUsageEstimatorService`，服务接口稳定，后续可以替换内部策略。
- 第一版估算规则固定为：`Math.ceil(text.length / 4)`；空文本计为 `0`。
- v2 流式完成时由 `StreamOrchestratorService` 统一计算本轮 usage，并传入 `MessageService.completeAssistantMessageV2()`。
- `promptTokens` 统计本轮实际发送给模型的消息内容：
  - 初始模型请求统计 `requestDto.messages`。
  - 如果发生工具调用后的 follow-up 请求，继续追加统计 `followUpDto.messages`。
- `completionTokens` 统计模型输出侧内容：
  - assistant 最终回答 `finalContent`。
  - reasoning 可见文本、summary、encryptedContent。
  - 工具调用参数文本 `argumentsText`。
- `stream.completed` 事件附带 `usage`，前端可暂不消费。

## Interface

```ts
interface TokenUsageEstimateInput {
  promptMessages: ChatMessage[];
  completionText: string;
  reasoningText?: string;
  toolArgumentsText?: string;
}

interface TokenUsageEstimateResult {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  source: 'estimated';
  strategy: 'chars-div-4';
}
```

写入 `Message.metadata.usage` 的结构示例：

```json
{
  "promptTokens": 123,
  "completionTokens": 45,
  "totalTokens": 168,
  "source": "estimated",
  "strategy": "chars-div-4"
}
```

## Implementation Notes

- 不修改 `ChatRequestDto` 的请求协议，不让前端传 token 信息。
- 不修改数据库结构，继续使用 `Message.metadata` JSONB。
- 不接入第三方 tokenizer；未来可在 `TokenUsageEstimatorService` 内按 provider/model 替换策略。
- usage 估算失败时只记录 warn，不影响消息完成和 SSE 结束。
- 未来如果 adapter 能读到上游真实 usage，可新增 `source: 'provider'` 并优先使用供应商返回值。

## Test Plan

- `TokenUsageEstimatorService` 单元测试：
  - 空输入返回 `0/0/0`。
  - 单条用户消息按 `length / 4` 向上取整。
  - 多条 prompt message 累加。
  - completion、reasoning、tool arguments 分别计入 completion。
  - `totalTokens = promptTokens + completionTokens`。
- v2 流式链路验证：
  - 普通 v2 流完成后，`completeAssistantMessageV2()` 收到 `usage`。
  - 有工具调用 follow-up 时，两次 prompt 都计入同一轮 usage。
  - 估算服务抛错时，消息仍完成，日志记录 warn。
- 构建验证：
  - `cd ai-proxy-server && pnpm build`

## Assumptions

- 第一版只覆盖 v2 流式主链路，不覆盖旧 `/api/ai/chat` 和旧 `/api/ai/chat/stream`。
- “每轮对话”指一次用户发送触发的完整后端处理过程，包括同一轮内的工具调用 follow-up。
- token 数值是估算值，不用于严格计费。
