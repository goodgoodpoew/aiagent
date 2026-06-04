# 会话管理与 AI 代理服务脱钩方案

## 目标

解除 `AiProxyController` 对 `SessionService` 和 `MessageService` 的直接依赖，使 AI 代理模块与会话管理模块独立演进。

## 当前问题

### 耦合点

`AiProxyController.chatStream()` 中混杂了 3 种职责：

```
chatStream() {
  1. 创建 session（sessionService.create）
  2. 保存 user message（messageService.create）
  3. 调用 AI 代理（aiProxyService.proxyChatStream）
  4. 在流回调中保存/更新 assistant message（messageService.create/update）
}
```

### 模块依赖图（改造前）

```
AiProxyModule
  ├─ SessionModule   ← 硬依赖
  ├─ MessageModule   ← 硬依赖
  └─ HttpModule
```

## 方案：事件驱动 + 预生成 UUID

### 架构

```
AiProxyController
  ├─ 预生成 sessionId / messageId（crypto.randomUUID()）
  ├─ 设置响应头 X-Session-Id（同步，无需等待 DB）
  ├─ 调用 aiProxyService.proxyChatStream()（纯代理）
  └─ 在关键节点发射事件
        │
        ▼
ChatPersistenceListener（新增，归属 SessionModule）
  ├─ onStreamStart  → 创建 session + user message + 空 assistant message
  ├─ onStreamComplete → 更新 assistant message content
  └─ onStreamError    → 更新 assistant message error
```

### 事件定义

| 事件名 | 触发时机 | 携带数据 | Listener 动作 |
|--------|---------|---------|---------------|
| `chat.stream.start` | 流开始前 | sessionId, userMessageId, assistantMessageId, userId, query, platform, model | DB 写入 session + user msg + 空 assistant msg |
| `chat.stream.complete` | 流正常结束 | sessionId, messageId, content | 更新 assistant msg content |
| `chat.stream.error` | 流出错 | sessionId, messageId, error | 更新 assistant msg error |

### ID 生成策略

- Controller 端使用 `crypto.randomUUID()` 预生成所有 ID
- `sessionId`：SSE 响应头 `X-Session-Id` 立即可用，无需等待数据库
- `userMessageId` / `assistantMessageId`：流回调中直接引用
- Listener 调用 Service 时传入预生成 ID，Prisma `@default(uuid())` 兼容（提供 id 则沿用，不提供则自动生成）
- **对数据库索引无影响**：UUID v4 随机性由算法保证，与生成位置无关

### 模块依赖图（改造后）

```
AiProxyModule
  └─ EventEmitterModule  ← 仅依赖事件模块

SessionModule
  ├─ ChatPersistenceListener  ← 新增，监听 chat.* 事件
  └─ SessionService / MessageService（不变）
```

---

## 实施步骤

### Step 1 — 安装依赖

```bash
cd ai-proxy-server
pnpm add @nestjs/event-emitter
```

### Step 2 — 注册 EventEmitterModule

**文件**：`src/app.module.ts`

```typescript
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [
    EventEmitterModule.forRoot(),  // 新增
    // ...其他模块
  ],
})
```

### Step 3 — 定义事件常量

**文件**：`src/ai-proxy/events/chat-events.ts`（新建）

```typescript
export const CHAT_EVENTS = {
  STREAM_START: 'chat.stream.start',
  STREAM_COMPLETE: 'chat.stream.complete',
  STREAM_ERROR: 'chat.stream.error',
} as const;

export interface StreamStartPayload {
  sessionId: string;
  userMessageId: string;
  assistantMessageId: string;
  userId: string;
  query: string;
  platform: string;
  model: string;
}

export interface StreamCompletePayload {
  sessionId: string;
  messageId: string;
  content: string;
}

export interface StreamErrorPayload {
  sessionId: string;
  messageId: string;
  error: string;
}
```

### Step 4 — 改造 AiProxyController

**文件**：`src/ai-proxy/ai-proxy.controller.ts`

变更点：
- 移除 `SessionService` / `MessageService` 注入，改为注入 `EventEmitter2`
- 用 `crypto.randomUUID()` 预生成 `sessionId`、`userMessageId`、`assistantMessageId`
- 在流开始/完成/出错节点发射事件
- 响应头 `X-Session-Id` 使用预生成的 `sessionId`

### Step 5 — 改造 SessionService / MessageService

**文件**：`src/session/session.service.ts`、`src/message/message.service.ts`

`create` 方法增加可选 `id` 参数：

```typescript
// SessionService
async create(userId: string, dto: CreateSessionDto, id?: string) {
  return this.prisma.session.create({
    data: { ...(id ? { id } : {}), userId, title: dto.title },
  });
}

// MessageService
async create(sessionId: string, dto: CreateMessageDto, id?: string) {
  const message = await this.prisma.message.create({
    data: {
      ...(id ? { id } : {}),
      sessionId,
      role: dto.role,
      content: dto.content,
      metadata: ...,
    },
  });
  await this.prisma.session.update({
    where: { id: sessionId },
    data: { updatedAt: new Date() },
  });
  return message;
}
```

### Step 6 — 新建 ChatPersistenceListener

**文件**：`src/session/chat-persistence.listener.ts`（新建）

监听 `chat.stream.*` 事件，负责所有数据库写入操作。

```typescript
@Injectable()
export class ChatPersistenceListener {
  constructor(
    private readonly sessionService: SessionService,
    private readonly messageService: MessageService,
  ) {}

  @OnEvent(CHAT_EVENTS.STREAM_START)
  async handleStreamStart(payload: StreamStartPayload) { ... }

  @OnEvent(CHAT_EVENTS.STREAM_COMPLETE)
  async handleStreamComplete(payload: StreamCompletePayload) { ... }

  @OnEvent(CHAT_EVENTS.STREAM_ERROR)
  async handleStreamError(payload: StreamErrorPayload) { ... }
}
```

### Step 7 — 更新 AiProxyModule

**文件**：`src/ai-proxy/ai-proxy.module.ts`

```typescript
@Module({
  imports: [HttpModule],  // 不再导入 SessionModule / MessageModule
  controllers: [AiProxyController],
  providers: [AiProxyService],
  exports: [AiProxyService],
})
```

### Step 8 — 更新 SessionModule

**文件**：`src/session/session.module.ts`

注册 `ChatPersistenceListener` 为 Provider。

---

## 影响范围

| 层级 | 变化 |
|------|------|
| Schema | **不变** |
| 数据库索引 | **不变** |
| Session CRUD API | **不变**（`POST/GET/PATCH/DELETE /api/sessions`） |
| SessionService.create | **向前兼容**（id 参数可选） |
| MessageService.create | **向前兼容**（id 参数可选） |
| AiProxyController | 移除 Session/Message 依赖，改用事件 |
| AiProxyModule | 移除 Session/Message 模块导入 |

---

## 验证清单

- [ ] `POST /api/ai/chat/stream` 流式响应正常
- [ ] 响应头 `X-Session-Id` 正确返回
- [ ] 数据库中 session 和 message 记录正确创建
- [ ] 流完成后 assistant message 的 content 完整更新
- [ ] 流出错时 assistant message 记录 error
- [ ] Session CRUD API（`/api/sessions/*`）不受影响
- [ ] 非流式 `POST /api/ai/chat` 不受影响
- [ ] `GET /api/ai/health` 不受影响
