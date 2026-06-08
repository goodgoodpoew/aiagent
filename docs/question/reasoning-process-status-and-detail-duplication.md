# 思考过程状态与详情重复问题排查记录

## 问题现象

- 当正式回答正文已经开始流式输出时，回答过程面板仍显示“进行中”，用户会误以为思考过程还没有结束。
- “思考摘要”和“查看详情”展开后的内容完全一样，展开动作没有提供额外信息，体验不友好。

## 排查链路

1. 前端渲染入口：`antdXStudy/src/pages/base/components/MessagePartsRenderer.tsx`
   - v2 消息会先渲染 `AnswerProcessPanel`，再渲染正文 `text` parts。
   - 原实现把 `message.status === 'streaming'` 作为 `streaming` prop 传给过程面板。
   - 这会把整条 assistant 消息的正文流式状态误用成过程面板状态。

2. 过程面板：`antdXStudy/src/pages/base/components/AnswerProcessPanel.tsx`
   - 原面板顶部状态使用 `streaming ? 'running' : ...`，所以只要正文还在流，顶部就显示“进行中”。
   - `buildReasoningItem` 将同一个 `visibleText` 同时作为摘要和详情渲染，导致“思考摘要”和“查看详情”内容重复。

3. 前端状态收口：`antdXStudy/src/store/messageStore/index.ts`
   - `message.part.completed` 对 reasoning part 的处理会在 `data.status === 'done'` 时把 reasoning 状态置为 `done`。
   - 因此前端 store 具备表达“思考已完成，但正文仍在流”的状态能力。

4. 后端流式收口：`ai-proxy-server/src/agent-runtime/engines/native-agent-engine.service.ts`
   - `finalizeMessage` 会在 `reasoningPartStarted` 为 true 时发送 reasoning `message.part.completed`。
   - 最终 `message.completed` 快照通过 `StreamMessageBuilderService.buildCompletedAssistantMessage` 写入 `status: 'done'` 的 reasoning part。

## 根因结论

- 状态语义混用：过程面板顶部被整条消息的 `streaming` 状态驱动，而不是被过程项自己的状态驱动。
- 内容展示复用：reasoning 的摘要和详情都使用同一份 `visibleText`，没有短摘要和完整详情的区分。

## 解决方案

- `AnswerProcessPanel` 移除外部 `streaming` prop，改为根据 `ProcessItem` 状态推导顶部状态：
  - 存在 `running` 或 `pending` 项时显示“进行中”。
  - 存在失败或跳过项时显示对应问题态。
  - 否则显示“已完成”。
- `MessagePartsRenderer` 不再把整条消息状态传给过程面板；正文 text part 继续独立流式渲染。
- reasoning 展示改为短摘要和完整详情：
  - 摘要区展示前端生成的 200 字左右短预览。
  - “查看详情”展示完整可见 reasoning 内容。
  - 如果完整内容不长于短摘要，则隐藏“查看详情”，避免重复。
- 补充测试覆盖：
  - reasoning 已完成、text 仍 streaming 时，过程面板显示“已完成”。
  - reasoning 长文本展示短摘要，详情保留完整文本。
  - reasoning 短文本不展示重复详情入口。
  - `message.part.completed` 可以把 reasoning part 收口为 `done`。
  - native engine 收尾时会发送 reasoning completed 事件，并在最终消息快照中持久化 done 状态。

## 验证记录

- `cd antdXStudy && pnpm vitest run src/store/messageStore/index.spec.ts`
  - 通过：19 个测试通过。
- `cd ai-proxy-server && pnpm jest --selectProjects unit src/agent-runtime/engines/native-agent-engine.service.spec.ts --runInBand`
  - 通过：unit 项目 16 个测试套件、52 个测试通过。
- `cd antdXStudy && pnpm vitest run src/pages/base/components/AnswerProcessPanel.component.spec.tsx src/pages/base/components/MessagePartsRenderer.component.spec.tsx`
  - 首次执行发现测试断言未考虑 DOM 空白归一化，已修正断言；复跑通过：2 个测试文件、5 个测试通过。
- `cd antdXStudy && pnpm test:unit`
  - 通过：21 个测试文件、109 个测试通过。
- `cd antdXStudy && pnpm test:components`
  - 首次执行发现 `BaseLayout.component.spec.tsx` 使用 `getByRole('switch')`，但当前输入区存在多个开关；已改为断言所有开关在流式中禁用。
  - 复跑通过：5 个测试文件、15 个测试通过。
- `cd ai-proxy-server && pnpm test:unit`
  - 通过：16 个测试套件、52 个测试通过。

## 手工验收建议

使用支持 reasoning 输出的模型发起一次会产生正式回答的聊天：

1. 等正式回答正文开始输出后，观察回答过程面板顶部不再因为正文 streaming 而显示“进行中”。
2. 如果 reasoning part 已完成，子项显示“已完成 / 思考摘要”。
3. 长 reasoning 展示短摘要；展开“查看详情”后能看到完整内容。
4. 短 reasoning 不出现重复的“查看详情”入口。
