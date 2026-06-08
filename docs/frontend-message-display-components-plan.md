# 前端消息展示组件拆分计划

生成日期：2026-06-07  
执行标注（2026-06-07）：已完成消息展示目录拆分、Bubble role 集成、组件测试与生产构建；未做浏览器视觉回归。
功能范围：`antdXStudy` 聊天页消息展示组件体系

功能全生命周期进度：
- [x] 阶段1 功能设计：明确预期、边界、非目标
- [x] 阶段2 主流实现对照：调研主流方案与本项目框架最佳实践
- [x] 阶段3 制定计划：写入 docs/ 下的项目文件
- [x] 闸门A 计划锐评打分：达标后才放行
- [x] 阶段4 拆分计划：计划过大时拆为独立小步
- [x] 阶段5 开发实现：按计划逐步落地
- [x] 闸门B 实现锐评打分：审查实现相对计划的偏差
- [x] 阶段6 测试集成与验证：测试、构建、行为验收

## Summary

当前聊天页消息展示能力集中在 `BaseLayout.tsx`、`MessagePartsRenderer.tsx`、`AnswerProcessPanel.tsx`，已经能显示文本、附件、回答过程、工具调用和引用雏形，但组件边界偏粗。随着后续任务、引用、步骤、工具调用、文件读取等结构化内容继续增加，继续堆在页面组件里会让渲染逻辑难以维护。

本次目标是在不改变 SSE v2 协议、不改变 Redux 消息结构、不改后端的前提下，把“消息展示”拆成一个独立组件目录：对外仍契合 `@ant-design/x` 的 `Bubble.List role.contentRender` 机制，对内用 Ant Design 组件与 token 驱动样式承接多种 message part。

## 阶段1：功能设计

### 要解决什么问题

把聊天消息的文本、附件、回答过程、引用、工具结果等展示责任从页面组件中拆出，形成可扩展、可测试、可主题化的前端消息展示组件体系。

### 预期行为

- `BaseLayout` 只配置 `Bubble.List` 角色和主页面流程，不直接拼装用户消息附件或 assistant part 展示。
- assistant 消息继续支持旧 `content` 文本投影和 v2 `parts` 渲染，不破坏现有流式消息。
- 用户消息可以展示发送时的附件 metadata，样式由独立组件负责。
- 消息展示目录内提供统一样式入口，使用 `antd` token 注入 CSS 变量，便于后续主题扩展。
- 后续新增任务、引用、步骤、工具调用展示时，可以在消息展示目录内新增组件，不必修改 `BaseLayout` 主体。

### 边界与非目标

- 本次不改 `aiagent.stream.v2` 协议字段，不新增后端事件。
- 本次不改 Redux store、selector、message adapter 的数据结构。
- 本次不重构会话侧栏、会话文件栏、输入器上传逻辑；这些可作为后续 UI 拆分。
- 本次不引入新的样式方案或第三方 UI 库，只使用 `antd`、`@ant-design/x`、`@ant-design/x-markdown` 和现有图标体系。

### 影响面

- 影响 `antdXStudy/src/pages/base/components` 下聊天消息展示相关组件。
- 影响前端组件测试。
- 不影响 `ai-proxy-server`、数据库、Redis、文件系统存储和 SSE v2 协议。

## 阶段2：主流实现对照

- 主流做法：AI 聊天 UI 通常把消息列表容器、消息 role 渲染、结构化 part 渲染、过程/引用/附件渲染分层；渲染入口贴合聊天组件库的 role/contentRender 扩展点，内部再按 part type 分流。Ant Design X 官方 `Bubble.List` 支持 role 自定义与 `contentRender`；Ant Design 官方主题能力推荐通过 `ConfigProvider` 与 `theme.useToken` 消费设计 token。
- 本项目现状：`selectBubbleItems` 已经把 Redux 消息投影为 `Bubble.List` items，数据出口清晰；但 `BaseLayout` 仍直接写用户附件展示，`MessagePartsRenderer` 直接处理 part 分类、过程面板、文件 tag 和 markdown。
- 本次取舍：保留 `Bubble.List` + `role.contentRender` 的主流入口，新增消息展示目录负责 role 内容和 part 内容；用 Ant Design token 生成 CSS 变量，不引入 CSS-in-JS 或复杂设计系统。

参考依据：
- Ant Design X Bubble 文档：`https://x.ant.design/components/bubble/`
- Ant Design X v2 迁移文档：`https://x.ant.design/docs/react/migration-v2/`
- Ant Design 主题定制文档：`https://ant.design/docs/react/customize-theme/`

## Key Changes

1. 新增 `message-display/` 组件目录
   - `AssistantMessageContent`：assistant 消息入口，兼容 v2 parts 与旧 content。
   - `UserMessageContent`：用户消息入口，渲染用户文本和发送附件。
   - `MessageText`：统一 markdown 文本渲染。
   - `MessageAttachments`：统一文件/附件 tag 展示。
   - `MessageProcessPanel`：承接现有回答过程面板能力。
   - `partGroups`：集中处理 message parts 分组，给未来任务、步骤、引用展示预留分类位置。
   - `style` / `message-display.css`：用 Ant Design token 注入 CSS 变量，集中管理消息展示样式。

2. 收敛 `BaseLayout` 中的 Bubble role 渲染
   - assistant role 调用 `AssistantMessageContent`。
   - user role 调用 `UserMessageContent`。
   - 删除页面内用户附件 metadata 拼装和旧文本投影调用。

3. 保留兼容出口
   - 旧 `MessagePartsRenderer.tsx` 可作为兼容 re-export，减少外部引用破坏。
   - 如需迁移测试，可让测试指向新目录内组件。

## Interface

```ts
interface AssistantMessageContentProps {
  message: ChatMessage;
}

interface UserMessageContentProps {
  message: ChatMessage;
}

interface MessageAttachmentsProps {
  items: Array<{
    id: string;
    name: string;
    type?: string;
    size?: number;
    status?: string;
  }>;
  compact?: boolean;
}
```

对 `BaseLayout` 的接口保持为：

```tsx
<Bubble.List role={bubbleRole} items={bubbleItems} />
```

## Implementation Notes

- `BaseLayout` 不再关心 message metadata 的附件字段结构，只把完整 `ChatMessage` 交给 role 内容组件。
- `partGroups` 第一版至少分出 `textParts`、`fileParts`、`processParts`、`referenceParts`、`errorParts`、`otherParts`，其中未来展示未落地的分组可以先不渲染，但命名要稳定。
- `MessageProcessPanel` 可复用现有 `AnswerProcessPanel` 的实现逻辑，必要时通过 re-export 兼容旧路径。
- `message-display.css` 不写死大面积颜色，颜色、边框、圆角、间距通过 CSS 变量接收 token 值。
- 中文 UI 文案保持现有风格，不新增解释性大段文案。

## Test Plan

- 更新 `MessagePartsRenderer.component.spec.tsx` 或新增消息展示组件测试：
  - 无 parts 时渲染旧消息正文。
  - v2 text part、file part、process panel 正常显示。
  - 用户消息 metadata.attachments 正常显示。
- 更新 `BaseLayout.component.spec.tsx`：
  - 聊天页仍能通过 `Bubble.List role.contentRender` 渲染用户与 assistant 内容。
- 运行：
  - `cd antdXStudy && pnpm test:components`
  - `cd antdXStudy && pnpm build`

## Assumptions

- 当前 `@ant-design/x` 仍使用 `Bubble.List role.contentRender` 作为自定义消息内容入口。
- 当前 `antd` 版本支持 `theme.useToken()`，可用于组件内读取 token。
- 本次第一版以结构拆分和主题接入为核心，不追求把任务、步骤等未来展示一次性做满。
