# 非流式接口统一数据返回层架构评估与实施计划

生成日期：2026-06-03

## 1. 背景

当前项目请求方式可以分为两类：

- **非流式请求**：普通 HTTP JSON 接口，例如会话、消息、文件上传、模型供应商、健康检查、非流式 AI chat 等。
- **流式请求**：`POST /api/ai/chat/stream`，通过 SSE 持续输出大模型生成内容。

本计划只处理第一类：**非流式请求的统一数据返回层**。

流式请求暂不纳入本阶段设计，原因是当前流式链路从请求参数、上下文组装、SSE chunk 结构、前端解析、错误事件、消息持久化到 `@ant-design/x-sdk` 适配都存在更底层的架构问题。现阶段流式接口的目标仅是：

- 能调通大模型。
- 能直观看到模型输出。
- 能支撑学习和演示。

流式链路后续应作为单独专题做重大重构，不应该被这次“统一返回层”改造牵着走。

## 2. 当前问题

非流式接口目前存在这些问题：

- 后端 controller 直接返回业务数据本体，例如 `ModelProvider[]`、`BackendSessionDto`、分页对象等。
- 成功响应没有统一外层结构，前端无法稳定获取 `code`、`message`、`traceId` 等元信息。
- 错误处理分散在 controller、service、Nest 默认异常响应和前端 request 配置中。
- 业务错误常用 `throw new Error()` 表达，缺少稳定错误码和用户友好提示。
- 前端 `antdXStudy/src/service/request.ts` 已有 Umi request 配置，但没有真正做统一解包和错误提示。
- 前端 service 类型目前直接声明为业务数据本体，例如 `Promise<ModelProvider[]>`，说明后端统一响应后，前端需要通过 request 层自动解包，避免页面大面积改动。

需要特别区分：

- **普通 JSON 接口**：本阶段统一包装。
- **文件下载接口**：返回 `StreamableFile`，不包装成功响应，只统一异常出口。
- **SSE 流式接口**：本阶段完全不改协议、不改返回结构、不纳入验收。

## 3. 推荐结论

推荐采用 NestJS 主流的全局 `Interceptor + ExceptionFilter + AppException` 架构，并在前端通过 Umi Max `request` 做统一解包和错误展示。

核心原则：

- **仅覆盖非流式 JSON 接口**：不处理 `/api/ai/chat/stream` 的请求体、响应体、SSE 事件和前端解析。
- **保留 HTTP 状态码语义**：成功使用 2xx，参数错误 400，未登录 401，无权限 403，资源不存在 404，限流 429，上游服务异常 502/503，系统异常 500。
- **JSON body 统一 envelope**：让前端拿到稳定的 `success / code / message / data / traceId / timestamp`。
- **业务错误显式抛出**：通过自定义 `AppException` 携带错误码、用户友好提示和 HTTP 状态。
- **系统错误统一兜底**：未知错误不向前端暴露堆栈、API Key、上游原始报文等敏感信息。
- **文件下载成功响应跳过包装**：二进制或文件流保持原生响应。
- **前端 service 尽量保持业务类型**：由 `request` responseInterceptor 自动解包 `data`，减少页面和 store 的迁移面积。

这是当前 NestJS + Umi Max 技术栈下，针对非流式接口最主流、最稳妥的方案。

## 4. 本阶段范围

### 4.1 纳入范围

本阶段覆盖这些非流式 JSON 接口：

| 模块 | 接口示例 | 说明 |
| --- | --- | --- |
| 会话 | `/api/sessions`、`/api/sessions/:id`、`/api/sessions/:id/messages` | CRUD、分页、消息查询 |
| 文件 | `/api/files/upload`、`/api/files/:id`、`/api/files/:id/content` | 上传和元数据/内容查询 |
| 模型供应商 | `/api/model-providers` | 供应商、凭证、模型 CRUD |
| AI 非流式 | `/api/ai/chat`、`/api/ai/health` | 非流式 chat 和健康检查 |
| 其他 JSON 接口 | 后续新增普通接口 | 默认纳入统一响应层 |

### 4.2 排除范围

本阶段明确不处理：

| 类型 | 接口 | 处理策略 |
| --- | --- | --- |
| SSE 流式聊天 | `/api/ai/chat/stream` | 不改请求结构，不改 SSE chunk，不改前端解析，不纳入本计划 |
| 文件下载 | `/api/files/:id/download` | 成功响应不包装，异常仍走统一错误响应 |
| 未来流式重构 | 大模型流式、工具调用、RAG、上下文编排 | 单独开设计方案 |

### 4.3 为什么不处理流式

流式接口不是简单的“返回格式不统一”问题，而是完整交互协议问题：

- 请求参数需要重新设计，不能长期混用 `query`、`messages`、`sessionId`、`provider`、`platform` 等临时结构。
- 后端当前在 controller 中承担大量会话、上下文、模型代理和 SSE 编排职责。
- 前端存在 `fetch` 直连、`@ant-design/x-sdk` provider、store thunk 等多条流式消费路径。
- SSE chunk 目前仍偏向兼容 OpenAI `choices` 结构，后续如果支持更多 provider，需要重新定义模型输出抽象。
- 错误事件、完成事件、持久化事件和 UI 展示应整体重构。

因此，本阶段只保证“流式接口不被统一响应层破坏”。

## 5. 统一响应协议

### 5.1 成功响应

所有非流式 JSON 成功响应统一为：

```json
{
  "success": true,
  "code": "OK",
  "message": "请求成功",
  "data": {},
  "traceId": "req_01j...",
  "timestamp": "2026-06-03T10:20:30.000Z",
  "path": "/api/sessions"
}
```

字段说明：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `success` | `boolean` | 请求是否业务成功 |
| `code` | `string` | 机器可读错误码或 `OK` |
| `message` | `string` | 前端可直接展示的友好提示 |
| `data` | `T \| null` | 业务数据 |
| `traceId` | `string` | 请求追踪 ID，用于前后端排查问题 |
| `timestamp` | `string` | 服务端响应时间 |
| `path` | `string` | 请求路径 |

### 5.2 错误响应

所有非流式 JSON 错误响应统一为：

```json
{
  "success": false,
  "code": "VALIDATION_ERROR",
  "message": "请求参数有误，请检查后重试",
  "data": null,
  "error": {
    "details": [
      {
        "field": "model",
        "message": "model 不能为空"
      }
    ]
  },
  "traceId": "req_01j...",
  "timestamp": "2026-06-03T10:20:30.000Z",
  "path": "/api/ai/chat"
}
```

错误响应规则：

- `message` 是用户友好的中文文案。
- `code` 是前端判断业务分支的稳定枚举。
- `error.details` 只放可公开的诊断信息。
- 禁止返回 API Key、Authorization header、数据库堆栈、上游完整报文。
- 后端日志记录 `traceId` 和脱敏后的内部错误详情。

### 5.3 分页响应

分页数据放在 `data` 内部：

```json
{
  "success": true,
  "code": "OK",
  "message": "请求成功",
  "data": {
    "items": [],
    "nextCursor": null,
    "hasMore": false
  },
  "traceId": "req_01j...",
  "timestamp": "2026-06-03T10:20:30.000Z",
  "path": "/api/sessions"
}
```

原因：当前会话、消息列表已经接近这种结构，迁移时只需要外层 envelope，不需要重塑分页协议。

### 5.4 空响应

对于删除、更新状态等没有业务数据的接口，统一返回：

```json
{
  "success": true,
  "code": "OK",
  "message": "请求成功",
  "data": null,
  "traceId": "req_01j...",
  "timestamp": "2026-06-03T10:20:30.000Z",
  "path": "/api/files/:id"
}
```

建议后续不要在普通 JSON 接口中返回 `204 No Content`，因为它没有响应 body，不利于统一 envelope。文件下载等特殊接口除外。

## 6. 后端架构设计

### 6.1 目录建议

```text
ai-proxy-server/src/common/
  errors/
    app.exception.ts
    error-code.enum.ts
    error-message.map.ts
    error-normalizer.ts
  filters/
    global-exception.filter.ts
  interceptors/
    response-envelope.interceptor.ts
  middleware/
    request-id.middleware.ts
  response/
    api-response.types.ts
    skip-response-envelope.decorator.ts
```

### 6.2 `ApiResponse<T>` 类型

```ts
export interface ApiResponse<T = unknown> {
  success: boolean;
  code: string;
  message: string;
  data: T | null;
  traceId: string;
  timestamp: string;
  path: string;
  error?: {
    details?: unknown;
  };
}
```

### 6.3 `ResponseEnvelopeInterceptor`

职责：

- 只处理非流式 JSON 成功响应。
- 将 controller 返回值包装为 `ApiResponse<T>`。
- 对 `undefined` 返回值统一转为 `data: null`。
- 若返回值已经是标准 envelope，避免重复包装。
- 跳过 SSE、文件下载、已手动响应的接口。

跳过策略：

- 使用 `@SkipResponseEnvelope()` 装饰器显式跳过。
- 检查响应 `Content-Type` 为 `text/event-stream`、`application/octet-stream`、`application/pdf` 等时跳过。
- 对 `StreamableFile` 跳过。
- 对使用 `@Res()` 完全手动响应的接口谨慎跳过，避免拦截器误判。

适用接口：

- `/api/sessions`
- `/api/model-providers`
- `/api/files/upload`
- `/api/files/:id`
- `/api/files/:id/content`
- `/api/ai/chat`
- `/api/ai/health`

不适用接口：

- `/api/ai/chat/stream`
- `/api/files/:id/download`

### 6.4 `GlobalExceptionFilter`

职责：

- 捕获非流式请求中的所有异常。
- 将 Nest `HttpException`、`ValidationPipe` 错误、Prisma 错误、Axios 错误、未知错误统一映射为 `ApiResponse<null>`。
- 记录服务端日志，日志中包含 `traceId`、path、method、status、内部错误摘要。
- 对前端只返回安全、友好的中文提示。
- 对 SSE 接口不主动改造协议；如果异常发生在响应开始前，可按普通 HTTP 错误兜底；如果响应已经开始，留给后续流式重构处理。

异常映射建议：

| 异常来源 | HTTP 状态 | code | message |
| --- | ---: | --- | --- |
| DTO 校验失败 | 400 | `VALIDATION_ERROR` | 请求参数有误，请检查后重试 |
| 业务主动拒绝 | 400 | `BAD_REQUEST` | 请求无法处理 |
| 未登录 | 401 | `UNAUTHORIZED` | 请先登录后再操作 |
| 无权限 | 403 | `FORBIDDEN` | 当前账号无权执行该操作 |
| 数据不存在 | 404 | `NOT_FOUND` | 资源不存在或已被删除 |
| 限流 | 429 | `RATE_LIMITED` | 请求过于频繁，请稍后重试 |
| Prisma 唯一冲突 | 409 | `CONFLICT` | 数据已存在，请勿重复提交 |
| Prisma 记录不存在 | 404 | `NOT_FOUND` | 资源不存在或已被删除 |
| 上游 4xx | 502 | `UPSTREAM_REJECTED` | 模型服务拒绝请求，请稍后重试 |
| 上游 5xx | 503 | `UPSTREAM_UNAVAILABLE` | 模型服务暂时不可用 |
| 上游网络错误 | 503 | `UPSTREAM_NETWORK_ERROR` | 无法连接模型服务 |
| 未知异常 | 500 | `INTERNAL_SERVER_ERROR` | 系统开小差了，请稍后重试 |

### 6.5 `AppException`

业务层不要直接 `throw new Error('未选择文件')`，建议统一为：

```ts
throw new AppException({
  code: ErrorCode.FILE_REQUIRED,
  message: '请先选择要上传的文件',
  status: HttpStatus.BAD_REQUEST,
});
```

这样可以保证：

- service/controller 抛出的业务异常有稳定错误码。
- 前端能通过 `code` 做分支处理。
- 用户看到的是友好提示，而不是内部实现文案。

### 6.6 错误码分层

建议错误码按领域分组：

```text
COMMON
  OK
  BAD_REQUEST
  VALIDATION_ERROR
  UNAUTHORIZED
  FORBIDDEN
  NOT_FOUND
  CONFLICT
  RATE_LIMITED
  INTERNAL_SERVER_ERROR

AI
  AI_PROVIDER_NOT_FOUND
  AI_MODEL_NOT_FOUND
  AI_PROVIDER_NOT_CONFIGURED
  AI_ADAPTER_UNSUPPORTED
  UPSTREAM_REJECTED
  UPSTREAM_UNAVAILABLE
  UPSTREAM_NETWORK_ERROR

SESSION
  SESSION_NOT_FOUND
  SESSION_CREATE_FAILED
  MESSAGE_CREATE_FAILED

FILE
  FILE_REQUIRED
  FILE_NOT_FOUND
  FILE_TOO_LARGE
  FILE_TYPE_UNSUPPORTED
  FILE_PARSE_FAILED

MODEL_PROVIDER
  PROVIDER_NAME_DUPLICATED
  CREDENTIAL_INVALID
  MODEL_NAME_DUPLICATED
```

说明：`STREAM_INTERRUPTED`、SSE 事件错误码等暂不纳入本阶段，后续流式重构时单独设计。

## 7. 前端架构设计

### 7.1 Umi request 统一解包

当前 `antdXStudy/src/service/request.ts` 已经导出全局 request 配置，但尚未真正处理响应。

推荐在 response interceptor 中：

- 识别后端 envelope。
- `success === true` 时返回 `data`，让现有 service 继续拿业务数据本体。
- `success === false` 时抛出标准前端错误对象。
- 对非 envelope 响应兼容透传，便于灰度迁移。
- 不接管流式 `fetch`，不改 `StreamChatProvider`，不改 `/api/ai/chat/stream`。

迁移后，现有代码仍可保持：

```ts
export async function fetchProviders(): Promise<ModelProvider[]> {
  return request(`${BASE_URL}/model-providers`);
}
```

前端拿到的仍是 `ModelProvider[]`，而不是 `{ success, data }`。

### 7.2 前端统一错误对象

建议定义：

```ts
export interface ApiClientError {
  code: string;
  message: string;
  status?: number;
  traceId?: string;
  details?: unknown;
}
```

所有通过 Umi request 发起的非流式请求统一捕获这个对象。

### 7.3 用户提示策略

`request.errorConfig.errorHandler` 统一负责默认错误提示：

- 普通查询失败：`message.error(error.message || '请求失败，请稍后重试')`
- 表单提交失败：调用方可自行 catch 并绑定到表单。
- 401：后续接入登录后跳转登录页。
- 429：提示请求频繁。
- 带 `traceId` 的错误，开发环境可在 console 打印，生产环境不直接展示给用户。

### 7.4 fetch 直连接口处理

当前 `chat.ts` 里有两类原生 `fetch`：

- `sendChatStream`：流式聊天，本阶段不改。
- `uploadFile`：文件上传，属于非流式 JSON 响应，应统一解析 envelope。

建议：

- 文件上传可以迁移到 Umi request，让它自然复用统一解包和错误处理。
- 如果继续保留 fetch，则新增一个 `parseApiEnvelope(response)` helper，只服务非流式 JSON 响应。
- 下载接口继续使用浏览器原生下载，不走 JSON 解包。

## 8. 迁移计划

### Phase 1：定义非流式响应协议和基础设施

目标：不改变业务行为，先搭统一层。

任务：

- 新增 `ApiResponse<T>` 类型。
- 新增 `ErrorCode` 枚举和默认中文文案表。
- 新增 `AppException`。
- 新增 `RequestIdMiddleware`，为每个请求生成或透传 `X-Request-Id`。
- 新增 `ResponseEnvelopeInterceptor`。
- 新增 `GlobalExceptionFilter`。
- 在 `main.ts` 注册 middleware、interceptor、filter。
- 给 `/api/ai/chat/stream` 和 `/api/files/:id/download` 添加 `@SkipResponseEnvelope()`。

验收标准：

- 普通 JSON 成功接口统一返回 envelope。
- 普通 JSON 错误接口统一返回 envelope。
- `/api/ai/chat/stream` 的请求和响应完全不变。
- `/api/files/:id/download` 下载不受影响。

### Phase 2：错误语义收敛

目标：把散落的 `throw new Error()` 和上游错误转换为领域错误。

任务：

- 文件上传未选择文件改为 `FILE_REQUIRED`。
- 模型供应商不存在或未启用改为 `AI_PROVIDER_NOT_FOUND`。
- 不支持的 adapter 改为 `AI_ADAPTER_UNSUPPORTED`。
- Prisma `P2002`、`P2025` 等常见错误统一映射。
- 非流式 AI 请求中的上游错误映射为 `UPSTREAM_REJECTED`、`UPSTREAM_UNAVAILABLE`、`UPSTREAM_NETWORK_ERROR`。
- DTO 校验错误输出字段级 `details`。

验收标准：

- 前端看到的错误提示都是中文友好文案。
- 后端日志保留排查所需的脱敏详情。
- 上游 API Key、Authorization header、数据库堆栈不出现在响应 body 中。
- 不修改流式错误 sink 和 SSE chunk 结构。

### Phase 3：前端非流式请求层接入

目标：后端 envelope 对页面和 store 尽量无感。

任务：

- 改造 `antdXStudy/src/service/request.ts`。
- 定义 `ApiEnvelope<T>` 和 `ApiClientError` 类型。
- response interceptor 自动解包 `data`。
- errorHandler 统一展示错误提示。
- 对 `fetchSessions`、`fetchProviders`、`fetchSessionMessages` 做回归验证。
- 文件上传接口统一解析 envelope 或迁移到 Umi request。

验收标准：

- 现有非流式 service 方法返回类型基本不变。
- 页面不需要到处写 `res.data`。
- 后端非流式错误能在前端统一弹出友好提示。
- `sendChatStream` 和 `StreamChatProvider` 不被本阶段改造影响。

### Phase 4：清理和测试

目标：完成非流式统一返回层的收口。

任务：

- 移除非流式接口里的重复错误处理逻辑。
- 补充单元测试：interceptor、filter、error normalizer。
- 补充集成测试：成功、参数错误、业务错误、上游错误、文件上传错误。
- 更新 README 或开发文档中的非流式接口协议说明。

验收标准：

- `pnpm build` 通过。
- `pnpm lint` 通过。
- 核心非流式接口响应格式一致。
- 前端会话、消息、模型供应商、文件上传等页面可用。
- 流式聊天仍能保持当前“可调通、可看到输出”的状态。

## 9. 推荐实施顺序

建议优先级：

1. 后端非流式 JSON envelope 和 exception filter。
2. 前端 Umi request 自动解包。
3. 业务错误码替换散落错误。
4. 文件上传错误接入统一协议。
5. 非流式接口测试和文档补齐。

原因：

- JSON 接口改造收益最大，风险可控。
- 前端自动解包能显著降低迁移成本。
- 文件上传属于非流式 JSON 响应，可以一起收敛。
- 流式接口风险高且问题更底层，应等待后续单独重构。

## 10. 风险与注意事项

- **不要把所有错误都返回 HTTP 200**：这会破坏浏览器、Umi request、日志平台、网关和监控对错误的标准识别。
- **不要包装文件下载成功响应**：否则浏览器无法正确下载文件。
- **不要改造 SSE 流式协议**：本阶段不新增 `event: message/error/done`，不修改当前 `choices` chunk。
- **不要向前端暴露上游原始错误**：AI 平台错误中可能包含请求信息、配额信息或敏感配置。
- **不要一次性修改所有 service 类型**：优先在 request 层解包，降低页面改动范围。
- **不要把流式接口纳入本阶段验收**：只要求不被破坏。

## 11. 最终目标架构

本阶段目标架构：

```text
前端页面 / Redux thunk
  -> antdXStudy/src/service/*
    -> Umi request 统一解包
      -> ai-proxy-server 非流式 JSON 接口
        -> RequestIdMiddleware
        -> Controller
        -> Service / Domain
        -> ResponseEnvelopeInterceptor
        -> GlobalExceptionFilter
          -> ApiResponse<T>
```

排除在本阶段之外的流式链路：

```text
前端 Chat Provider / sendChatStream
  -> /api/ai/chat/stream
    -> 当前 SSE 临时协议
      -> 能调通大模型并看到输出即可
      -> 后续单独做重大重构
```

这个方案把当前最需要标准化、也最容易稳定落地的非流式接口先统一起来，同时避免在流式架构尚未想清楚前过早固化协议。
