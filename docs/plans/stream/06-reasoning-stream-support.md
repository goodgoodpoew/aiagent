# 06 思考过程流式支持计划

## 动机

DeepSeek、Claude、OpenAI 等模型都在提供不同形态的 reasoning/thinking 能力。当前协议只有 assistant 文本，无法区分可展示回答、思考摘要、内部推理 token 和供应商要求续传的 encrypted thinking。

本计划在 v2 协议上增加思考过程支持，但默认以安全、克制的方式展示。

## 修改原因

- 思考内容不应该拼入普通 `content`。
- 不同 provider 对 reasoning 的返回字段和展示限制不同。
- 用户需要看到“正在思考”或摘要，但不一定应该看到完整推理。
- 后续工具调用前的规划状态也需要有位置表达。

## 修改位置

后端：

- [x] `ai-proxy-server/src/streaming/protocol/message-part.types.ts`（已有 `ReasoningMessagePart`，本次复用）
- [x] `ai-proxy-server/src/streaming/protocol/stream-event.types.ts`（已为 part delta/completed 增加 `field/summary/encryptedContent`）
- [x] `ai-proxy-server/src/streaming/adapters/openai-compatible-stream.adapter.ts`（已识别 `reasoning_content`、summary、encrypted thinking）
- [x] `ai-proxy-server/src/streaming/services/stream-message-builder.service.ts`（已新增 reasoning part start/delta/complete/build 逻辑）
- [x] `ai-proxy-server/src/streaming/services/stream-orchestrator.service.ts`（已分流 text/reasoning，reasoning 不进入 `content`）
- [x] `ai-proxy-server/src/model-provider/model-provider.types.ts`（已补充 reasoning runtime/capability 类型）

前端：

- [x] `antdXStudy/src/store/types.ts`（已为 draft/send payload 增加 `reasoning`）
- [x] `antdXStudy/src/store/messageStore/index.ts`（已处理 reasoning part delta/completed，且不回投影到 `content`）
- [x] `antdXStudy/src/pages/base/components/MessagePartsRenderer.tsx`（已显示思考中状态、摘要/完整内容折叠区、hidden 隐藏正文）
- [x] `antdXStudy/src/store/contentStore/index.ts`（已默认 `enabled: true`、`display: summary`）

## 目标

- 请求体支持 `runtime.reasoning`。
- provider adapter 能识别 reasoning 字段。
- v2 支持 reasoning part。
- UI 能显示思考状态或思考摘要。
- reasoning 不进入普通 `content`。

执行标注：已完成。偏错纠正：默认开启的是“识别 reasoning + 仅摘要/状态展示”，不会默认展示完整思考链；只有显式 `display: full` 时才把原始 reasoning 文本发送到前端并持久化。

## 实施方案

1. 请求参数：

```ts
reasoning?: {
  enabled?: boolean;
  effort?: 'low' | 'medium' | 'high';
  display?: 'none' | 'summary' | 'full';
}
```

执行标注：已完成。前端 `ChatDraft`、流请求类型、后端 `ChatStreamRequestV2`、`ChatRequestDto` 均已支持该结构；代理层只对 OpenAI/Azure OpenAI 这类明确支持 effort 参数的 provider 透传 `reasoning_effort`，其他 provider 保持忽略请求侧参数但仍可识别返回字段。

2. 新增 reasoning part：

```ts
interface ReasoningMessagePart {
  id: string;
  type: 'reasoning';
  text?: string;
  summary?: string;
  encryptedContent?: string;
  visibility: 'hidden' | 'summary' | 'full';
  status: 'streaming' | 'done';
}
```

执行标注：已完成。前后端协议类型均包含 `ReasoningMessagePart`；本次补充了 part delta 的 `field`，用于区分 `text`、`summary`、`encryptedContent`。

3. adapter 映射：

- 如果 OpenAI-compatible provider 返回 `reasoning_content`，映射为 `reasoning.delta`。
- 如果 provider 返回 summary，映射为 reasoning completed summary。
- 如果 provider 不支持 reasoning，忽略 `runtime.reasoning` 或记录能力不支持。

执行标注：已完成。`OpenAiCompatibleStreamAdapter` 会把 `reasoning_content/reasoning/thinking` 归一为内部 `reasoning.delta`，把 `reasoning_summary/summary` 归一为 summary 字段，把 encrypted thinking 字段归一为 `encryptedContent`；同一 chunk 中 text 与 reasoning 可同时产出，避免丢字段。

4. builder 行为：

- reasoning delta 创建或更新 reasoning part。
- reasoning part 不更新 message.content。
- 如果 `display = none`，前端只收到状态事件或收到 hidden part。
- 如果 `display = summary`，只展示 summary。

执行标注：已完成。`StreamOrchestratorService` 只把 text part 累加到 assistant `content`；reasoning part 单独累计。`display=none` 会生成 hidden part 但不展示正文；`display=summary` 只展示供应商明确返回的 summary，若只有原始 reasoning_content，则只显示思考状态/完成状态，不把原始链路伪装成摘要。

5. UI 行为：

- streaming 时显示“思考中”状态。
- completed 后展示可折叠摘要。
- `visibility = hidden` 时不展示正文。

执行标注：已完成。`MessagePartsRenderer` 对 reasoning part 使用折叠区展示 summary/full 内容；hidden streaming 只显示“思考中”，完成后不渲染正文。

## 产出

- [x] reasoning 请求参数。
- [x] reasoning part 类型。
- [x] adapter reasoning 映射。
- [x] 前端 reasoning part 渲染。
- [x] reasoning 持久化到 `metadata.parts`。

执行标注：已完成。assistant 完成时 `completeAssistantMessageV2()` 写入包含 reasoning/text 的 `metadata.parts`，旧兼容 `content` 仍只保存 text 投影。

## 验收

- [x] 不支持 reasoning 的模型，文本聊天行为不变。
- [x] 支持 reasoning 字段的模型，前端能看到思考状态或摘要。
- [x] assistant `content` 只包含最终回答文本，不包含 reasoning。
- [x] 数据库 `metadata.parts` 中 reasoning 与 text 是两个 part。
- [x] 设置 `display: none` 时不展示 reasoning 文本。
- [x] 前后端构建通过。

执行标注：已验证。`pnpm build` 在 `ai-proxy-server` 与 `antdXStudy` 均通过。

## 风险与注意事项

- 不要默认展示完整思考链。
- 不要把 reasoning 写入普通日志。
- 如果 provider 对 thinking 有特殊合规要求，应在 adapter 层隔离处理。
- encrypted thinking 如果需要保存，应明确只用于续传，不进入 UI。
