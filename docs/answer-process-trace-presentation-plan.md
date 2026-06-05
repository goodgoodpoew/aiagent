# 大模型回答过程轨迹返回与呈现规划

生成日期：2026-06-05

完善日期：2026-06-05

## 1. 背景

当前项目已经完成流式 v2 协议、message parts、reasoning、工具调用、文件读取等基础能力。后续如果只把“思考过程”理解为大模型原始 reasoning 文本，会带来两个问题：

- 展示范围太窄，无法覆盖 MCP 调用、知识库检索、文件读取、工具执行、上下文组装等真实过程。
- 安全边界不清，容易把不应展示的内部推理、敏感参数、凭据、完整文件内容或工具原始返回直接暴露给前端。

因此，本规划把“思考过程”重新定义为 **回答过程轨迹**。它不是模型内部链式推理的同义词，而是一次回答从准备、检索、调用、生成到完成的可观察过程记录。

推荐结论：

> 在现有 v2 协议上引入统一的 `process_trace` 概念，把 reasoning、MCP、知识库、文件读取、工具调用、引用和错误都纳入同一套过程轨迹模型；前端以“可折叠时间线 + 回答正文分离”的方式呈现，默认展示摘要、状态和来源，不默认展示完整内部推理或敏感原始数据。

进一步补充：

> 回答过程轨迹不是回答正文的附属装饰，而是聊天体验中的核心反馈层。尤其在耗时较长、工具链较复杂、知识库/文件/MCP 参与较多的场景里，过程本身就能让用户感到系统“正在认真工作”，即便某个步骤失败，只要说明清楚失败原因、影响范围和后续降级策略，它依然是一种正反馈。

## 2. 目标

- 统一表达模型思考摘要、工具调用、MCP 调用、知识库读取、文件读取、引用来源等过程。
- 让用户知道系统正在做什么、用了哪些上下文、哪些步骤失败或被跳过。
- 把过程反馈作为高优先级体验，而不是只在调试模式里展示。
- 让失败、跳过、超时、截断等过程也能形成透明反馈，减少用户等待时的不确定感。
- 让最终回答和过程信息分离，避免过程文本污染 assistant 正文。
- 支持流式更新，用户能看到过程从 `pending / running / done / failed / skipped` 变化。
- 支持刷新后恢复，过程轨迹写入 `Message.metadata.parts` 或后续独立 trace 表。
- 支持安全分级展示，不泄露隐藏推理、API Key、工具敏感参数、过长原文和未授权资源。
- 与现有 `reasoning`、`tool_call`、`tool_result`、`file_read`、`reference` parts 渐进兼容。

## 3. 非目标

- 不把模型完整内部推理链作为默认产品能力。
- 不在第一版实现复杂 agent planner 或多智能体编排。
- 不要求所有 provider 都返回 reasoning；provider 不支持时仍能展示工具、文件、知识库等外部过程。
- 不把 MCP resource、知识库文档或文件全文直接塞进过程面板。
- 不让前端直接连接 MCP server 或直接执行任意工具。

## 4. 成熟产品参考与启发

### 4.1 ChatGPT Deep Research

[ChatGPT Deep Research](https://help-lb.openai.com/en/articles/10500283-deep-research-in-chatgpt) 的公开说明里，核心不是只给最终报告，而是能使用上传文件、Web、已连接应用和指定来源，并在最终输出里提供引用或来源链接，用户可以验证信息。OpenAI 对 Deep Research 的介绍也强调它会搜索、解释和分析大量网页、图片和 PDF，并给出清晰引用和思考摘要（见 [Introducing deep research](https://openai.com/index/introducing-deep-research/)）。

对本项目的启发：

- 过程轨迹要能展示“用了哪些来源”，而不是只展示“正在思考”。
- 文件、Web、MCP、应用连接器都应该被看作上下文来源，进入统一过程面板。
- 最终答案要能回链到过程里的来源和引用，形成可验证闭环。
- 深度任务可以先问澄清问题，再进入长过程；过程面板需要支持多阶段状态。

### 4.2 OpenAI Deep Research API

[OpenAI Deep Research API 文档](https://platform.openai.com/docs/guides/deep-research?lang=curl) 提到深度研究模型可以寻找、分析和综合大量来源，输出带 inline citations 的最终回答，并可通过 `max_tool_calls` 控制 Web search 或 MCP server 等工具调用总数；文档也特别提醒来自网页、文件搜索或 MCP 搜索内容中的 prompt injection 风险。

对本项目的启发：

- 过程轨迹需要记录工具调用预算、调用次数、是否达到上限。
- MCP 和知识库不是“可信文本”，过程面板应标记来源类型和安全处理状态。
- 引用不是简单附在答案末尾，而应和检索/读取过程建立结构化关联。
- 对外部内容应记录“已过滤/已脱敏/已截断”等安全处理结果。

### 4.3 Claude Extended Thinking 与 Tool Use

[Claude extended thinking 文档](https://platform.claude.com/docs/claude/build-with-claude/extended-thinking) 把 extended thinking 作为复杂任务的增强 reasoning 能力，并提供不同程度的透明度。Claude 的 [tool use 文档](https://docs.claude.com/en/docs/tool-use) 则强调模型会使用工具结果来组织最终回答，工具是独立于普通文本的结构化能力。

对本项目的启发：

- 思考能力和工具能力应共同进入过程轨迹，而不是分成两个互不关联的 UI。
- `reasoning` 应支持 `hidden / summary / full` 多级可见性。
- 工具调用的参数生成、执行、结果处理要有清晰生命周期。
- 最终回答最好能体现“基于哪些过程结果得出”，但不要把完整内部推理暴露为正文。

### 4.4 Gemini Deep Research

[Gemini Deep Research 帮助文档](https://support.google.com/gemini/answer/15719111?hl=en-GB) 提到 Deep Research 默认包含 Google Search，用户也可以取消 Google Search，把研究限制在选定来源内。

对本项目的启发：

- 用户需要感知和控制来源范围，例如“仅当前会话文件”“仅知识库”“允许 MCP”“允许 Web”。
- 过程轨迹应展示哪些来源被启用、哪些来源被排除。
- 如果用户限制了来源，最终答案和过程面板都应如实反映这个约束。

### 4.5 Perplexity

Perplexity 对自身的定位是把世界知识压缩、引用并解释清楚（见 [About Perplexity](https://www.perplexity.ai/el/hub/about)）。其 Premium Data Sources 帮助文档也强调多来源答案应被充分引用（见 [Premium Data Sources](https://www.perplexity.ai/help-center/en/articles/12870803-premium-data-sources)）。

对本项目的启发：

- 对用户来说，“看见来源”本身就是信任感和正反馈。
- 过程面板可以像答案的一部分一样重要，尤其在检索、研究、对比、总结类任务中。
- 引用质量需要被产品化展示：命中数量、来源类型、可信来源、未使用来源都应可见。

### 4.6 共性结论

成熟产品的共同方向：

- **Show the work**：不只给答案，也展示检索、读取、调用、分析、引用。
- **Source control**：用户可以选择或限制来源，系统要展示实际使用了什么。
- **Progressive disclosure**：默认给状态和摘要，详情主动展开。
- **Trust through citations**：引用和来源是信任基础，不是装饰。
- **Agentic progress**：耗时任务要持续给进度反馈，减少等待焦虑。
- **Failure as signal**：失败不是只能隐藏，清楚的失败原因能增强用户对系统边界的理解。
- **Safety boundary**：透明不等于泄露，过程展示必须和脱敏、截断、权限控制同时设计。

## 5. 概念定义

### 5.1 回答过程轨迹

回答过程轨迹是一次 assistant 回答中的可观察步骤集合，简称 `Process Trace`。

它包含：

- 模型思考状态：思考中、思考摘要、已完成。
- 上下文准备：历史消息、附件、知识库、资源引用是否进入上下文。
- 文件读取：读取哪个文件、读取状态、token 估算、失败原因。
- 知识库检索：查询词、命中文档数量、引用片段摘要。
- MCP 调用：server、tool/resource、参数摘要、状态、结果摘要。
- 内置/自定义工具调用：工具名称、参数摘要、执行状态、结果摘要。
- 错误与降级：某个步骤失败、被跳过、超时、权限不足或结果被截断。

### 5.2 与 reasoning 的关系

`reasoning` 是过程轨迹的一类，但不是全部。

```text
回答过程轨迹
  |
  +-- reasoning：模型自身的思考状态或供应商返回的思考摘要
  +-- context：上下文组装、历史压缩、附件进入上下文
  +-- retrieval：知识库、文件、MCP resource 检索
  +-- tool：工具调用和工具结果
  +-- reference：最终回答引用的来源
  +-- error：过程中的局部失败或降级
```

产品上应优先展示“模型做了什么、用了什么、结果如何”，而不是展示完整原始思维链。

## 6. 展示原则

### 6.1 默认分层

过程轨迹按三个层级展示：

- `status`：只展示状态，例如“正在读取文件”“正在调用工具”“思考完成”。
- `summary`：展示摘要，例如“读取了 2 个文件，约 3200 tokens”“检索到 5 条相关片段”。
- `detail`：展示可展开详情，例如工具参数摘要、知识库命中文档列表、引用片段。

默认策略：

- 普通用户默认看 `status + summary`。
- `detail` 需要用户主动展开。
- 完整原始 reasoning 默认不展示。
- 敏感参数、凭据、文件绝对路径、过长结果默认脱敏或截断。

### 6.2 正反馈优先级

过程轨迹应被视为用户等待期间的主要正反馈来源。

产品策略：

- 第一屏要尽快出现过程反馈，避免用户只看到空白 loading。
- 流式过程中，过程面板应持续更新，即使最终回答尚未开始输出。
- 对 3 秒以内的短任务，可以展示轻量状态。
- 对超过 3 秒的任务，应自动展开过程面板。
- 对超过 10 秒的任务，应展示更明确的阶段、已完成步骤和当前耗时。
- 失败步骤默认可见，除非包含敏感信息。

建议体验指标：

- `time_to_first_trace`：首个过程事件应尽量在 300ms 到 800ms 内出现。
- `trace_heartbeat_interval`：长任务每 1 到 2 秒应有状态变化、耗时变化或阶段提示。
- `visible_progress_ratio`：长任务 streaming 期间，过程面板应占据主要反馈区域，不低于回答气泡可见高度的三分之一。
- `recoverable_failure_visibility`：局部失败、跳过、截断不应被吞掉，应转成用户能理解的状态。

### 6.3 与回答正文分离

UI 中应保持两条信息线：

- 回答正文：assistant 的最终文本、Markdown、代码块、图片或文件输出。
- 过程轨迹：折叠时间线，不拼接进正文，不参与 `content` 文本投影。

推荐布局：

```text
┌──────────────────────────────┐
│ 过程轨迹（默认折叠/轻量展示）       │
│ - 已读取 2 个文件                 │
│ - 已调用 search_docs             │
│ - 思考完成                       │
└──────────────────────────────┘

assistant 最终回答正文...
```

### 6.4 状态语义

过程步骤统一状态：

- `pending`：已计划但未开始。
- `running`：正在执行。
- `done`：成功完成。
- `failed`：执行失败，但不一定代表整条消息失败。
- `skipped`：因配置、权限、无可用数据或预算限制跳过。
- `cancelled`：用户取消或上游中断。

### 6.5 失败也要形成正反馈

过程失败的展示目标不是制造错误感，而是让用户知道系统边界和下一步动作。

推荐文案结构：

```text
动作 + 结果 + 影响 + 后续策略
```

示例：

- “读取附件失败：PDF 超过大小限制。本轮未使用该文件，已继续基于会话上下文回答。”
- “知识库检索超时：已使用前 3 条命中结果继续生成。”
- “MCP 工具返回空结果：未找到匹配资源，最终回答可能缺少外部数据支持。”
- “工具参数包含敏感字段：已隐藏部分参数，调用仍已完成。”

失败展示规则：

- 局部失败不等于整条回答失败。
- 失败项需要保留在过程时间线中。
- 失败项应该说明是否影响最终回答可信度。
- 可重试失败应提供“可重试”状态给后续 UI 使用。

## 7. 协议设计

### 7.1 复用现有 message parts

当前已有以下 part，可直接纳入过程轨迹：

- `reasoning`：模型思考状态、摘要或隐藏内容。
- `tool_call`：工具调用参数生成和执行状态。
- `tool_result`：工具执行结果或错误。
- `file_read`：附件读取状态。
- `reference`：引用来源。
- `error`：局部错误。

第一阶段不必立刻推翻现有结构，而是在渲染层把这些 part 聚合为过程轨迹。

### 7.2 新增通用过程 part

为了覆盖知识库、MCP resource、上下文压缩、检索、计划步骤等不适合硬编码为独立类型的过程，建议新增通用 part：

```ts
interface ProcessTraceMessagePart {
  id: string;
  type: 'process_trace';
  traceType:
    | 'thinking'
    | 'context'
    | 'file_read'
    | 'knowledge_retrieval'
    | 'mcp_resource'
    | 'mcp_tool'
    | 'builtin_tool'
    | 'custom_tool'
    | 'citation'
    | 'system';
  title: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped' | 'cancelled';
  visibility: 'hidden' | 'status' | 'summary' | 'detail';
  summary?: string;
  detail?: Record<string, unknown>;
  refs?: Array<{
    type: 'file' | 'mcp' | 'knowledge' | 'web' | 'session' | 'tool';
    id?: string;
    title?: string;
    uri?: string;
  }>;
  metrics?: {
    startedAt?: string;
    completedAt?: string;
    durationMs?: number;
    tokenEstimate?: number;
    inputBytes?: number;
    outputBytes?: number;
  };
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}
```

使用原则：

- 已经有强语义 part 的能力继续使用强语义 part。
- 新能力暂时没有专用 part 时，先进入 `process_trace`。
- 当某类 `process_trace` 变复杂且高频，再升级为独立 part。

### 7.3 流式事件

建议新增或映射为以下事件：

```ts
type ProcessTraceStreamEventType =
  | 'process.trace.started'
  | 'process.trace.delta'
  | 'process.trace.completed'
  | 'process.trace.failed'
  | 'process.trace.skipped';
```

事件 data 示例：

```ts
interface ProcessTraceStartedData {
  part: ProcessTraceMessagePart;
}

interface ProcessTraceDeltaData {
  partId: string;
  summaryDelta?: string;
  detailPatch?: Record<string, unknown>;
  status?: ProcessTraceMessagePart['status'];
  metricsPatch?: ProcessTraceMessagePart['metrics'];
}

interface ProcessTraceCompletedData {
  partId: string;
  status: 'done' | 'failed' | 'skipped' | 'cancelled';
  summary?: string;
  detail?: Record<string, unknown>;
  refs?: ProcessTraceMessagePart['refs'];
  metrics?: ProcessTraceMessagePart['metrics'];
  error?: ProcessTraceMessagePart['error'];
}
```

兼容策略：

- 后端可以先继续发送 `message.part.started/delta/completed`。
- `process.trace.*` 作为更清晰的语义事件，后续再统一映射到 `message.part.*`。
- 前端 reducer 最终仍只落到 `message.parts[]`，避免维护两份状态。

## 8. 过程类型规划

### 8.1 模型思考

来源：

- provider 返回的 reasoning summary。
- provider 返回的 reasoning_content。
- 系统根据步骤状态生成的“思考中/整理中”状态。

展示策略：

- `display=none`：只展示状态，完成后可隐藏。
- `display=summary`：展示供应商明确返回的 summary。
- `display=full`：仅在明确开启时展示原始文本，并应标记为调试能力。
- encrypted thinking 只用于续传，不进入 UI。

### 8.2 文件读取

来源：

- 用户上传文件。
- 会话绑定文件。
- MCP/local resource 返回的文件。

展示内容：

- 文件名、类型、读取状态。
- token 估算或截断提示。
- 失败原因，例如格式不支持、文件过大、读取超时。
- 不默认展示全文。

### 8.3 知识库检索

来源：

- 本地知识库。
- 向量检索服务。
- 未来接入的企业文档源。

展示内容：

- 查询摘要。
- 命中数量。
- top 引用标题和来源。
- 是否进入模型上下文。
- 引用片段仅展示短摘录。

### 8.4 MCP resource

来源：

- MCP server 暴露的 resources。

展示内容：

- server 名称或安全别名。
- resource uri 的脱敏展示。
- 读取状态和摘要。
- 不展示 server 凭据、内部路径和完整资源原文。

### 8.5 MCP/tool 调用

来源：

- builtin tool。
- custom tool。
- MCP tool。

展示内容：

- 工具名。
- source：`builtin/custom/mcp`。
- 参数摘要。
- 执行状态。
- 结果摘要或错误。
- 耗时、结果是否截断。

### 8.6 引用来源

来源：

- 文件片段。
- 知识库片段。
- MCP resource。
- web/source uri。
- 会话历史。

展示内容：

- 标题。
- 来源类型。
- 可访问 uri 或 fileId。
- 短摘录。
- 与回答正文中的引用标记关联。

## 9. 过程面板信息架构

过程面板建议拆成四个信息区：

- `当前状态`：一句话说明系统正在做什么。
- `过程时间线`：展示步骤列表、状态、耗时、失败或跳过原因。
- `来源与引用`：展示文件、知识库、MCP resource、Web/source uri。
- `调试详情`：仅在开发/调试/高级设置下展示参数摘要、结果摘要、token、耗时。

推荐默认形态：

```text
回答过程  进行中  已完成 3/5 步
当前：正在整理工具结果

✓ 读取附件：产品需求.md
✓ 检索知识库：命中 6 条，采用 3 条
✓ 调用工具：get_current_time
… 思考与组织回答
○ 生成最终回答

来源：产品需求.md、知识库/订单模块、工具/get_current_time
```

完成后折叠形态：

```text
回答过程  已完成  5 步，3 个来源，1 个工具，耗时 8.2s
```

有局部失败时折叠形态：

```text
回答过程  部分完成  4 步成功，1 步跳过，最终回答已降级生成
```

## 10. 后端实现计划

### 10.1 过程事件服务

新增 `ProcessTraceService` 或在 `StreamMessageBuilderService` 中增加过程轨迹 helper：

- `startTrace(type, title, options)`
- `updateTrace(partId, patch)`
- `completeTrace(partId, result)`
- `failTrace(partId, error)`
- `skipTrace(partId, reason)`

职责：

- 生成稳定 `partId`。
- 写出 SSE event。
- 更新 assistant message parts。
- 做摘要截断和敏感字段脱敏。
- 记录 duration、tokenEstimate、输入输出大小等指标。

### 10.2 接入点

优先接入这些位置：

- 文件读取：`FileService`、`ChatContextService`。
- 工具执行：`ToolExecutorService`。
- MCP 适配：`McpToolAdapter`，后续 MCP resource adapter。
- provider adapter：reasoning 映射。
- context 构建：历史压缩、资源注入、超预算裁剪。
- stream orchestrator：统一完成、失败和取消事件。

### 10.3 脱敏与截断

后端必须先处理再下发：

- API Key、Authorization、Cookie、数据库连接串全部替换为 `[REDACTED]`。
- 工具参数按 schema 支持 `sensitive: true` 字段。
- 文件内容、工具结果、知识库片段默认只保留摘要和短摘录。
- 单个过程 part 的 `detail` 设置大小上限，超出则标记 `truncated: true`。

### 10.4 持久化

短期：

- 继续写入 `Message.metadata.parts`。
- `content` 只保存 assistant 文本投影。
- 过程轨迹刷新后可恢复。

中期：

- 如过程数据变大，可新增 `MessageProcessTrace` 表：

```text
MessageProcessTrace
  id
  messageId
  traceType
  title
  status
  visibility
  summary
  detailJson
  refsJson
  metricsJson
  createdAt
  updatedAt
```

拆表触发条件：

- `metadata.parts` 体积明显增大。
- 需要按 trace 查询、审计或分析。
- 需要对工具/MCP 调用做独立留痕。

## 11. 前端呈现计划

### 11.1 组件拆分

建议在 `MessagePartsRenderer` 基础上拆出：

- `AnswerProcessPanel`：过程轨迹总入口。
- `ProcessTimeline`：按时间展示步骤。
- `ProcessTraceItem`：单个过程项。
- `ReasoningTraceItem`：思考状态/摘要。
- `ToolTraceItem`：工具调用和工具结果。
- `RetrievalTraceItem`：知识库/MCP/file 读取。
- `ReferenceList`：回答引用来源。

### 11.2 默认 UI

推荐交互：

- assistant streaming 时，过程面板自动展开，显示 running 状态。
- assistant 完成后，如果过程全部成功，可自动折叠为一行摘要。
- 有失败、跳过、权限不足时，保留可见提示。
- 工具参数和结果默认折叠。
- 引用来源可在回答末尾单独展示，也可与正文引用标记联动。
- 用户再次打开历史消息时，默认保持完成态摘要，但可展开完整过程。
- 当过程占比很高时，允许过程面板固定在回答正文上方，避免被长答案淹没。

视觉结构：

```text
回答过程  已完成  4 个步骤，1 个工具，2 个引用
  ✓ 读取附件：需求文档.pdf
  ✓ 检索知识库：命中 5 条
  ✓ 调用工具：search_docs
  ✓ 思考完成

最终回答正文...
```

### 11.3 过程密度策略

不同任务的过程占比应不同：

- 普通闲聊：只展示轻量状态，避免打扰。
- 文件问答：重点展示读取了哪些文件、是否截断、是否进入上下文。
- 知识库/RAG：重点展示检索词、命中数量、采用来源、引用。
- 工具/MCP：重点展示工具名、参数摘要、执行状态、结果摘要。
- 深度研究：过程面板可成为主视觉，最终报告生成前持续展示计划、检索、阅读、综合和引用阶段。

建议分级：

```text
simple：一行状态
standard：折叠时间线 + 来源摘要
rich：默认展开时间线 + 引用列表 + 局部详情
debug：rich + 参数摘要 + token/耗时/截断信息
```

### 11.4 文案原则

- 用用户能理解的动作描述，不暴露内部类名。
- “思考过程”文案改为“回答过程”或“处理过程”。
- 对 reasoning 使用“思考摘要”而不是“完整思考链”。
- 对失败使用可行动描述，例如“文件过大，本轮仅读取前 20 页”。
- 对敏感隐藏使用自然文案，例如“部分参数已隐藏”。

## 12. 权限与可见性

每个过程 part 都应有 `visibility`：

- `hidden`：仅后端使用，不下发或下发空状态。
- `status`：只展示状态。
- `summary`：展示摘要。
- `detail`：允许展开详情。

影响可见性的因素：

- 用户配置。
- 模型供应商限制。
- 工具 schema 的敏感字段。
- 文件/知识库权限。
- 当前环境是开发、调试还是生产。
- 会话分享或导出场景。

导出和分享时建议默认只带：

- 最终回答。
- 引用来源。
- 过程摘要。

不带：

- 原始工具参数。
- 原始工具结果。
- 原始 reasoning。
- 隐藏字段。

## 13. 阶段路线

### 第一阶段：前端统一呈现

目标：

- 不改或少改协议。
- 把现有 `reasoning/tool_call/tool_result/file_read/reference/error` parts 聚合成回答过程面板。
- assistant 正文只渲染 `text` part。

产出：

- `AnswerProcessPanel`。
- 现有 parts 到过程项的 adapter。
- 基础折叠时间线 UI。

验收：

- 文件读取、工具调用、思考摘要不再散落在正文之间。
- 刷新后过程面板可恢复。
- 没有过程 part 的旧消息仍正常显示。
- streaming 期间首个过程反馈能快速出现。

### 第二阶段：新增通用 process_trace part

目标：

- 后端协议增加 `process_trace` part。
- 支持知识库检索、上下文压缩、MCP resource 等通用过程。
- 前端 reducer 支持 `process_trace` 增量和完成。

产出：

- 前后端 `ProcessTraceMessagePart` 类型。
- `message.part.*` 对 process_trace 的处理。
- 后端 `ProcessTraceService` 基础 helper。

验收：

- 后端能流式发送一个知识库检索过程。
- 前端能展示 running、done、failed、skipped。
- 完成后写入 `metadata.parts`。
- 失败、跳过、截断都能作为局部过程项持久化。

### 第三阶段：接入知识库与 MCP resource

目标：

- 把知识库检索和 MCP resource 读取接入过程轨迹。
- 形成引用来源和最终回答关联。

产出：

- `knowledge_retrieval` trace。
- `mcp_resource` trace。
- `reference` part 与过程 trace 的关联字段。

验收：

- 用户能看到检索命中来源。
- 回答末尾能显示引用列表。
- 未授权或失败资源以过程失败项展示，不导致整条消息崩溃。
- 用户能看到启用了哪些来源、排除了哪些来源。

### 第四阶段：审计、导出与调试模式

目标：

- 支持调试模式查看更详细 trace。
- 支持会话分享/导出时按可见性裁剪。
- 评估是否拆出 `MessageProcessTrace` 表。

产出：

- trace detail 开关。
- 导出裁剪策略。
- trace 数据量评估报告。

验收：

- 普通模式不泄露敏感数据。
- 调试模式可帮助开发定位工具/MCP/检索问题。
- 大 trace 不影响消息列表和聊天页性能。

### 第五阶段：深度任务体验

目标：

- 面向深度研究、复杂文件分析、多工具链任务，强化过程面板为主反馈区域。
- 支持任务计划、阶段进度、来源覆盖、工具预算、引用质量提示。

产出：

- `process_trace` 的阶段分组能力。
- 长任务过程面板。
- 来源控制和来源覆盖摘要。
- 引用质量提示。

验收：

- 用户在长任务等待期间始终能看到有意义的进展。
- 局部失败被解释为降级策略，而不是沉默或整条失败。
- 最终答案能回溯到关键过程和来源。

## 14. 风险与注意事项

- 不要把回答过程等同于完整内部推理链。
- 不要让模型自己生成的“我调用了某工具”替代真实工具事件。
- 不要把工具原始结果无限制写入前端和数据库。
- 不要把本地文件绝对路径、MCP server 凭据、HTTP header 放入 trace detail。
- 不要让局部工具失败直接覆盖整条 assistant 消息失败态。
- 不要为了展示过程而明显拖慢首 token 时间；可先发轻量 `started` 事件，详情异步补充。

## 15. 基础验收清单

- [ ] 普通文本聊天无过程轨迹时行为不变。
- [ ] 长任务能在 300ms 到 800ms 内出现首个过程反馈。
- [ ] reasoning 不进入 assistant `content`。
- [ ] 工具调用、工具结果、文件读取能统一出现在回答过程面板。
- [ ] 过程失败能局部展示，不导致整条回答消失。
- [ ] 刷新页面后过程轨迹仍可恢复。
- [ ] 过程详情有脱敏和长度限制。
- [ ] 分享/导出不会带出 hidden/detail 中的敏感字段。
- [ ] 知识库、MCP、文件、Web/source uri 能形成可见来源摘要。
- [ ] 过程面板能区分成功、失败、跳过、截断和降级继续。
- [ ] 前后端类型对齐，构建通过。

## 16. 参考资料

- [Deep research in ChatGPT | OpenAI Help Center](https://help-lb.openai.com/en/articles/10500283-deep-research-in-chatgpt)
- [Introducing deep research | OpenAI](https://openai.com/index/introducing-deep-research/)
- [Deep Research | OpenAI API](https://platform.openai.com/docs/guides/deep-research?lang=curl)
- [Building with extended thinking | Claude API Docs](https://platform.claude.com/docs/claude/build-with-claude/extended-thinking)
- [Tool use with Claude | Claude Docs](https://docs.claude.com/en/docs/tool-use)
- [Use Deep Research in Gemini Apps | Gemini Apps Help](https://support.google.com/gemini/answer/15719111?hl=en-GB)
- [About Perplexity](https://www.perplexity.ai/el/hub/about)
- [Premium Data Sources | Perplexity Help Center](https://www.perplexity.ai/help-center/en/articles/12870803-premium-data-sources)
