# Context Builder 预算保护计划

生成日期：2026-06-07

> 执行标注（2026-06-07）：已新增 `ContextBuilderService` 并接入 `ChatContextService`；已跑 `pnpm test:unit -- --runTestsByPath src/ai-proxy/context-builder.service.spec.ts`、`pnpm test:unit` 与 `pnpm build`，均通过。未实地验证真实上游模型长会话请求。

## Summary

本计划执行 `docs/session-management-optimization-evaluation.md` 的第一优先级：拆出最小 `ContextBuilder/ContextManager`，让 LLM 请求上下文从“全量历史直接投喂”变为“可预算、可裁剪、可观测”的临时 payload。

本阶段只做低档位上下文保护，不做滚动摘要、用户画像、长期记忆、记忆管理 UI，也不改写数据库原始消息。

## 功能全生命周期进度

- [x] 阶段1 功能设计：明确预期、边界、非目标
- [x] 阶段2 主流实现对照：对照主流上下文装配方式与本项目分层
- [x] 阶段3 制定计划：写入本文件
- [x] 闸门A 计划锐评打分：见 `docs/evaluation/context-builder-budget-plan-review.md`
- [x] 阶段4 拆分计划：本次范围较小，不拆分
- [x] 阶段5 开发实现：按本计划落地
- [x] 闸门B 实现锐评打分：写入 `docs/evaluation/context-builder-budget-impl-review.md`
- [x] 阶段6 测试集成与验证：运行后端相关单元测试与 build

## 功能设计

### 要解决什么问题

当前 `ChatContextService.prepareContext()` 保存用户消息后读取会话历史，再通过 `toLlmMessages()` 基本全量送入 LLM。长会话、附件文本、工具结果增长后会导致上下文超限、成本不可控，并且开发者无法观察本次到底选入了哪些历史消息。

### 预期行为

- 数据库仍保存完整原始 `Message`，不因上下文裁剪而改写历史。
- LLM payload 只从可用历史中选取预算内消息。
- 最近 3-5 条历史消息优先保留，用于维持短期语境。
- 超预算时从较旧消息开始裁剪。
- 后端日志能看到本次原始消息数、选入消息数、估算 token 和是否裁剪。
- 既有 v2 流式协议、消息持久化、文件附件语义不变。

### 边界与非目标

本次不做：

- 会话滚动摘要。
- 用户画像、长期记忆、偏好提取。
- 记忆管理 UI。
- provider 真实 tokenizer。
- 数据库 schema 变更。
- Redis/SSE 事件调整。
- 请求主链事务化改造。

### 影响面

- `ai-proxy-server/src/ai-proxy/`：新增上下文构建服务并接入 `ChatContextService`。
- `ai-proxy-server/src/ai-proxy/ai-proxy.module.ts`：注册新服务。
- `ai-proxy-server/src/ai-proxy/*.spec.ts`：新增单元测试。
- `docs/evaluation/`：补计划锐评与实现锐评。

## 主流实现对照

- 主流做法：成熟 AI 应用通常把“原始消息持久化”和“LLM 请求上下文装配”分层处理；请求前按模型窗口和业务策略做预算、裁剪、摘要或检索，数据库历史不被改写。
- 本项目现状：已有完整消息持久化、`Message.content` 文本投影、`metadata.parts` 结构化事实和估算 token 服务，但上下文装配仍在 `ChatContextService` 内部直接完成。
- 本次取舍：先做最低风险的 Context Builder 和字符估算预算，不引入摘要/画像/新表，避免过早复杂化。

## Key Changes

1. 新增 `ContextBuilderService`：
   - 输入原始历史消息。
   - 调用现有投影逻辑转换为 LLM 消息。
   - 按最近窗口和 token 预算选取消息。
   - 返回 `messages` 与 `debug` 信息。

2. 调整 `ChatContextService`：
   - 继续负责用户消息落库、附件事实关联、缓存读取。
   - 不再直接把全部 `toLlmMessages(rawMessages)` 返回。
   - 调用 `ContextBuilderService.build()` 获取预算内 messages。

3. 增加测试：
   - 预算足够时保留全部可用消息。
   - 超预算时保留最近消息并裁剪旧消息。
   - 失败消息和非 text part 投影仍沿用现有过滤规则。

## Interface

新增服务接口草案：

```typescript
interface BuildContextInput {
  rawMessages: MessageWithMetadata[];
  maxPromptTokens?: number;
  recentMessageLimit?: number;
}

interface BuildContextResult {
  messages: Array<{ role: string; content: string }>;
  debug: {
    rawMessageCount: number;
    candidateMessageCount: number;
    selectedMessageCount: number;
    estimatedPromptTokens: number;
    maxPromptTokens: number;
    truncated: boolean;
  };
}
```

默认值：

- `maxPromptTokens = 6000`
- `recentMessageLimit = 5`

说明：本阶段使用字符数除以 4 的轻量估算，保持与现有 `TokenUsageEstimatorService` 思路一致。

## Implementation Notes

- `toLlmMessages()` 继续保留在 `message-filter.util.ts`，避免重复实现消息投影。
- 裁剪算法保持简单：从新到旧尝试加入消息，确保最近消息优先；最后恢复时间顺序。
- 单条消息超过预算时仍保留最近一条，避免 payload 为空；真实截断单条内容属于后续能力。
- 日志只输出计数和 token 估算，不打印用户原文。
- 不修改前端。

## Test Plan

- `pnpm test:unit -- --runTestsByPath src/ai-proxy/context-builder.service.spec.ts`
- `pnpm test:unit`
- `pnpm build`

## Assumptions

- 本阶段只解决“不要全量历史投喂”的防爆线。
- 现有字符估算足够用于第一版预算保护，后续可替换为 provider/model tokenizer。
- 当前 `MessageService.findBySessionId()` 默认返回 50 条消息；本计划仍在这些消息内做预算裁剪，不改变分页策略。
