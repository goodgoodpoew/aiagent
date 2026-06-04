# 非流式请求接口开发规范

生成日期：2026-06-03

## 1. 适用范围

本规范适用于项目中的**非流式 HTTP JSON 接口**，包括：

- 会话、消息、文件上传、文件元数据、模型供应商等 CRUD 接口。
- 非流式 AI 请求，例如 `POST /api/ai/chat`。
- 健康检查、配置查询、列表分页、表单提交等普通 JSON 接口。

本规范不适用于：

- `POST /api/ai/chat/stream` 等 SSE 流式接口。
- 文件下载接口，例如 `GET /api/files/:id/download`。
- WebSocket、长轮询、二进制流、代理透传等特殊传输接口。

原则：**默认所有新增接口都按非流式 JSON 接口处理，除非它明确属于特殊传输接口。**

## 2. 统一响应约定

后端非流式接口不需要在 controller 中手动包装响应。controller 只返回业务数据，统一响应层会自动包装为：

```json
{
  "success": true,
  "code": "OK",
  "message": "请求成功",
  "data": {},
  "traceId": "req_xxx",
  "timestamp": "2026-06-03T10:20:30.000Z",
  "path": "/api/example"
}
```

错误响应统一为：

```json
{
  "success": false,
  "code": "VALIDATION_ERROR",
  "message": "请求参数有误，请检查后重试",
  "data": null,
  "error": {
    "details": []
  },
  "traceId": "req_xxx",
  "timestamp": "2026-06-03T10:20:30.000Z",
  "path": "/api/example"
}
```

开发要求：

- controller 不手动返回 `success/code/message/data`。
- service 不关心响应 envelope，只返回业务对象或抛出异常。
- 前端业务 service 默认拿到的是 `data` 本体，不拿 envelope。
- 错误判断使用 `code`，用户提示使用 `message`。

## 3. 后端开发规范

### 3.1 Controller

controller 只做 HTTP 层工作：

- 声明路由、HTTP 方法、参数来源。
- 调用 service。
- 返回业务数据本体。

推荐：

```ts
@Post()
create(@Body() dto: CreateExampleDto) {
  return this.exampleService.create(dto);
}
```

不推荐：

```ts
@Post()
async create(@Body() dto: CreateExampleDto) {
  const data = await this.exampleService.create(dto);
  return {
    success: true,
    code: 'OK',
    message: '请求成功',
    data,
  };
}
```

注意事项：

- 普通 JSON 接口不要使用 `@Res()` 手动响应。
- 普通 JSON 删除接口建议返回 `200 + data:null`，不要返回 `204 No Content`。
- 只有文件下载、SSE、二进制流等特殊接口才能使用 `@SkipResponseEnvelope()`。

### 3.2 Service

service 负责业务逻辑和数据访问：

- 成功时返回业务数据。
- 业务失败时抛出 `AppException` 或 Nest 标准异常。
- 不返回 envelope。
- 不直接拼接前端展示结构。

推荐：

```ts
if (!record) {
  throw new AppException({
    code: ErrorCode.NOT_FOUND,
    message: '资源不存在或已被删除',
    status: HttpStatus.NOT_FOUND,
  });
}
```

可以接受：

```ts
if (!record) {
  throw new NotFoundException('资源不存在或已被删除');
}
```

不推荐：

```ts
if (!record) {
  throw new Error('资源不存在');
}
```

### 3.3 DTO 校验

新增接口必须优先通过 DTO 表达入参约束：

- 使用 `class-validator` 声明必填、类型、枚举、长度、URL 等规则。
- 使用 `class-transformer` 处理嵌套对象和类型转换。
- 不在 service 中重复做基础类型校验，service 只处理业务校验。

推荐：

```ts
export class CreateExampleDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;
}
```

DTO 校验失败会被统一转换为：

- HTTP `400`
- `code: VALIDATION_ERROR`
- `message: 请求参数有误，请检查后重试`

### 3.4 错误码

新增业务错误时优先复用现有错误码：

- `BAD_REQUEST`
- `VALIDATION_ERROR`
- `NOT_FOUND`
- `CONFLICT`
- `FILE_REQUIRED`
- `FILE_TYPE_UNSUPPORTED`
- `AI_PROVIDER_NOT_FOUND`
- `AI_MODEL_NOT_FOUND`
- `UPSTREAM_UNAVAILABLE`

只有满足以下条件时才新增错误码：

- 前端需要基于该错误码做明确分支。
- 该错误属于稳定业务语义，而不是临时实现细节。
- 现有错误码无法准确表达。

新增错误码时必须同时修改：

- `ai-proxy-server/src/common/errors/error-code.enum.ts`
- `ai-proxy-server/src/common/errors/error-message.map.ts`
- 必要时补充 `error-normalizer.ts` 映射逻辑。

### 3.5 上游请求

非流式上游请求必须返回上游响应数据本体：

```ts
const response = await firstValueFrom(this.httpService.post(url, body, options));
return response.data;
```

不允许直接返回 `Observable`、Axios response 或 stream 对象。

上游错误不要直接暴露给前端。应交给统一错误层映射为：

- `UPSTREAM_REJECTED`
- `UPSTREAM_UNAVAILABLE`
- `UPSTREAM_NETWORK_ERROR`

### 3.6 文件接口

文件上传属于非流式 JSON 接口，应接入统一响应层。

文件下载属于特殊传输接口，必须跳过统一包装：

```ts
@Get(':id/download')
@SkipResponseEnvelope()
async download(...) {
  return new StreamableFile(stream);
}
```

文件下载异常如果发生在响应开始前，可以返回普通错误；响应已经开始后的流错误不纳入本规范。

## 4. 前端开发规范

### 4.1 Service 返回值

前端 service 只声明业务数据类型，不声明 envelope 类型。

推荐：

```ts
export function fetchExamples(): Promise<Example[]> {
  return request(`${BASE_URL}/examples`);
}
```

不推荐：

```ts
export function fetchExamples(): Promise<ApiEnvelope<Example[]>> {
  return request(`${BASE_URL}/examples`);
}
```

原因：`antdXStudy/src/service/request.ts` 已经统一解包 `data`。

### 4.2 错误处理

默认情况下，Umi request 会统一弹出错误提示。页面只有在需要特殊交互时才 catch：

```ts
try {
  await createExample(values);
} catch (error) {
  if (error instanceof ApiClientError && error.code === 'CONFLICT') {
    form.setFields([{ name: 'name', errors: [error.message] }]);
  }
}
```

要求：

- 不要在每个 service 中重复 `message.error()`。
- 不要通过字符串匹配判断错误。
- 需要业务分支时使用 `ApiClientError.code`。

### 4.3 原生 fetch

普通非流式 JSON 请求优先使用 Umi request。

只有上传、下载、特殊浏览器 API 场景才使用原生 `fetch`：

- 上传接口如果使用 `fetch`，必须调用 `parseApiEnvelopeResponse()`。
- 下载接口不解析 envelope，按浏览器下载流程处理。
- 流式接口不使用本规范中的解析 helper。

推荐：

```ts
const response = await fetch(url, options);
return parseApiEnvelopeResponse<UploadResult>(response, '上传失败');
```

## 5. 分页接口规范

分页接口的业务数据放在 `data` 内部，由统一响应层包外层 envelope。

推荐业务返回：

```ts
return {
  items,
  nextCursor,
  hasMore,
};
```

当前已有接口如果使用 `sessions/cursor` 或 `messages/cursor` 结构，可以保持兼容；新增接口优先使用：

```ts
{
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}
```

## 6. HTTP 状态码规范

常用状态码：

| 场景 | 状态码 |
| --- | ---: |
| 成功 | 200 |
| 创建成功 | 201 或 200 |
| 参数错误 | 400 |
| 未登录 | 401 |
| 无权限 | 403 |
| 资源不存在 | 404 |
| 数据冲突 | 409 |
| 限流 | 429 |
| 上游服务错误 | 502 / 503 |
| 系统异常 | 500 |

禁止：

- 所有错误都返回 200。
- 普通 JSON 接口成功但没有响应体。
- 把数据库错误、上游原始错误、API Key 等敏感信息放到响应 body。

## 7. 新增接口检查清单

新增非流式接口时，提交前检查：

- controller 没有手动包装 envelope。
- controller 没有在普通 JSON 接口中使用 `@Res()`。
- DTO 有必要的 `class-validator` 校验。
- service 成功返回业务数据本体。
- 业务错误使用 `AppException` 或 Nest 标准异常。
- 新错误码已同步错误码枚举和中文文案。
- 上游 HTTP 请求返回的是 `response.data`。
- 前端 service 返回业务类型，不返回 `ApiEnvelope<T>`。
- 文件上传使用 Umi request 或 `parseApiEnvelopeResponse()`。
- 文件下载、SSE 等特殊接口显式跳过 envelope。
- 后端 `pnpm build` 通过。
- 前端 `pnpm build` 通过。

## 8. 与流式接口的边界

本规范不定义流式请求的：

- 请求体结构。
- SSE event 类型。
- chunk 数据结构。
- 错误事件格式。
- 前端流式解析逻辑。
- 消息持久化时机。

当前流式接口只要求不被非流式统一响应层破坏。后续流式链路重构时，应单独制定流式接口规范。
