# Redux 上下文 Store 可扩展架构计划

## Summary

`antdXStudy` 已引入 Redux Toolkit + React Redux，用后端作为会话与消息的持久化事实来源，前端 Redux 作为运行时状态协调层。数据流固定为：

```text
后端 DTO -> service adapter 规范化 -> Redux 领域状态/runtime 状态 -> selector 生成页面 view model -> 页面渲染
```

## Key Changes

- 新增依赖：`@reduxjs/toolkit`、`react-redux`。
- `src/store/index.ts` 使用 `configureStore` 创建总 store，并导出 `RootState`、`AppDispatch`、`useAppDispatch`、`useAppSelector`。
- `src/app.ts` 用 Redux `Provider` 包裹现有 `XProvider`。
- `sessionStore` 管理会话列表、当前会话、分页、loading/error。
- `messageStore` 管理消息实体、会话下消息顺序、消息分页、流式消息 runtime 状态。
- `contentStore` 管理输入框、模型参数、发送参数草稿。
- `chatThunks` 统一跨 slice 编排初始化、切换会话、发送消息、处理 SSE、新会话同步、删除会话后的清理。

## Store 边界

- `sessionStore`
  - 保存：`entities`、`ids`、`currentSessionId`、`cursor`、`hasMore`、`loading`、`error`。
  - 负责：会话加载、选择、新建、重命名、删除、同步后端返回的新 `sessionId`。
  - 不负责：消息内容、Bubble 展示结构、输入框状态。

- `messageStore`
  - 保存：`entities`、`idsBySessionId`、`cursorBySessionId`、`hasMoreBySessionId`、`loadingBySessionId`。
  - runtime 保存：`statusByMessageId`、`errorByMessageId`、`streamingMessageId`。
  - 负责：历史消息加载、用户消息追加、助手消息流式更新、失败标记、会话消息缓存清理。
  - 不负责：当前会话选择、请求参数草稿。

- `contentStore`
  - 保存：`input`、`provider`、`model`、`credentialId`、`temperature`、`max_tokens`、`stream`。
  - 负责：输入与发送参数草稿。
  - 不负责：调用后端、保存消息、更新会话。

- `chatThunks`
  - 初始化：加载会话 -> 恢复当前会话 -> 加载消息。
  - 切换会话：设置当前会话 -> 加载目标会话消息。
  - 发送消息：读取 content -> 追加用户消息 -> 创建助手占位 -> SSE 增量更新 -> 同步新 `sessionId` -> 完成或失败。
  - 删除会话：删除后端会话 -> 清理消息缓存 -> 选择下一个会话或进入空状态。

## 扩展性设计

- 会话和消息使用 normalized state，通过 Redux Toolkit `createEntityAdapter` 管理 `entities + ids`。
- `src/store/adapters/sessionAdapter.ts` 和 `src/store/adapters/messageAdapter.ts` 是后端 DTO 进入 Redux 的固定转换入口。
- `src/store/selectors.ts` 是页面展示结构的固定出口，例如 `selectCurrentSession`、`selectCurrentMessages`、`selectBubbleItems`、`selectCanSend`、`selectStreamingState`。
- `src/service/session.ts`、`src/service/message.ts`、`src/service/chat.ts` 负责接口封装，后续扩展收藏、标签、搜索、多模型参数时优先从 service 和 thunk 扩展。
- 关键复杂逻辑必须保留简体中文注释，包括职责边界、adapter 转换、selector 派生、跨 store thunk 编排、SSE 增量合并、optimistic update、错误恢复、localStorage 同步。

## Test Plan

- 构建检查：运行 `pnpm build`。
- 初始化：无会话、有历史会话、有本地 `currentSessionId` 三种场景都能正常进入页面。
- 消息加载：切换会话只加载目标会话消息，不污染其他会话缓存。
- 流式发送：用户消息立即显示，助手消息增量更新，完成后状态变为 `done`。
- 新会话同步：后端返回新 `sessionId` 后，Redux 当前会话与 localStorage 同步。
- 失败处理：历史加载失败、SSE 失败、后端返回错误时，runtime 状态正确展示并恢复可发送。
- 删除会话：后端删除成功后，Redux 会话列表、当前会话、消息缓存保持一致。
- 注释检查：关键复杂逻辑均有简体中文注释，避免无意义注释堆积。

## Assumptions

- 后端负责持久化会话、消息、用户归属和最终 assistant 内容。
- 前端 Redux 负责运行时交互状态、缓存和页面协调。
- 前端只用 localStorage 保存轻量偏好，例如 `currentSessionId` 和最近模型选择。
- 不把 `Bubble.List`、loading、streaming、error 等纯展示状态写入后端持久化模型。
- `sessionStore`、`messageStore`、`contentStore` 不直接互相依赖，跨 store 逻辑统一进入 `chatThunks`。
- 代码注释、UI 文案、提交信息统一使用简体中文。
