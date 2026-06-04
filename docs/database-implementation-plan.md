# 聊天机器人 - 会话数据库层开发计划

## 1. 方案评估

### 1.1 PostgreSQL 选型确认

用户提出的 PostgreSQL 方案完全合理，具体评估如下：

| 考量维度 | 评估结果 |
|---------|---------|
| **数据模型匹配度** | 高。Session/Message 是典型的关联关系型数据，PostgreSQL 的 JSONB 可灵活存储 AI 特有元数据（token 消耗、模型参数等）。 |
| **未来扩展性** | 高。`pgvector` 插件可直接在同一个数据库中做 RAG 向量检索，无需引入额外向量数据库。 |
| **ORM 生态** | 高。Prisma / Drizzle / TypeORM 对 PostgreSQL 支持均为一等公民。 |
| **运维成本** | 低。开发阶段用 Docker 一键启动，生产环境有托管服务（Supabase、Railway、RDS 等）。 |
| **写多读少场景** | 适合。聊天记录是典型的尾部追加写，PostgreSQL 的 B-Tree 索引 + 联合索引完美适配。 |

**结论：无需修改方案，PostgreSQL 为首选。**

### 1.2 ORM 选型：推荐 Prisma

三种主流 TypeScript ORM 对比：

| 特性 | Prisma | Drizzle | TypeORM |
|------|--------|---------|---------|
| NestJS 集成 | 优秀（`@nestjs/prisma`） | 需手动封装 | 官方 `@nestjs/typeorm` |
| 类型安全 | 自动生成类型 | TypeScript 原生 | 装饰器 + 编译时 |
| 迁移工具 | 内置 `prisma migrate` | 内置 `drizzle-kit` | 需额外配置 |
| Schema 定义 | Prisma Schema 文件 | TypeScript 代码 | 装饰器 / 配置文件 |
| 学习曲线 | 低 | 中 | 中高 |
| 社区热度 | 最高（GitHub 40k+ stars） | 快速增长（25k+） | 稳定但下滑 |

**推荐 Prisma**，理由：
- NestJS 官方社区模块 `@prisma/nestjs` 提供开箱即用的 PrismaModule
- Schema 文件直观可读，便于团队协作理解数据模型
- 迁移工具成熟，`prisma migrate dev` 一键生成 SQL 迁移文件
- 本项目从零开始，没有历史包袱

### 1.3 Schema 设计确认

用户提出的表结构与最佳实践一致，补充以下几点：

- **`id` 使用 UUID v4**：比 NanoID 更适合数据库主键（PostgreSQL 有原生 `uuid` 类型，索引效率高）
- **`updated_at` 自动更新**：可用 Prisma 的 `@updatedAt` 指令自动维护
- **联合索引 `(session_id, created_at)`**：覆盖聊天记录查询中最常见的 WHERE + ORDER BY 模式
- **软删除字段 `is_deleted`**：建议类型为 `Boolean`，默认 `false`，配合 Prisma 的 `@@index` 加速查询

---

## 2. 技术选型

| 组件 | 选择 | 说明 |
|------|------|------|
| 数据库 | PostgreSQL 16 | Docker 部署，开发环境即开即用 |
| ORM | Prisma 6.x | Schema-first，NestJS 集成好 |
| 迁移工具 | Prisma Migrate | 内置于 Prisma，SQL 文件可追溯 |
| ID 生成 | UUID v4 | PostgreSQL `gen_random_uuid()` |
| 容器化 | Docker Compose | 一键启动 PostgreSQL + 可选 pgAdmin |

---

## 3. 实施阶段

### 阶段一：基础设施搭建

**目标**：PostgreSQL 可用 + Prisma 连接通

#### 3.1.1 Docker Compose 配置

在 `ai-proxy-server/` 下新增 `docker-compose.yml`，定义 PostgreSQL 服务：

```yaml
# ai-proxy-server/docker-compose.yml
services:
  postgres:
    image: postgres:16-alpine
    container_name: ai-chat-db
    environment:
      POSTGRES_USER: aichat
      POSTGRES_PASSWORD: aichat_dev
      POSTGRES_DB: aichat
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

#### 3.1.2 安装 Prisma 依赖

```bash
cd ai-proxy-server
pnpm add prisma @prisma/client
pnpm add -D @nestjs/prisma
```

#### 3.1.3 初始化 Prisma

```bash
npx prisma init
```

生成 `prisma/schema.prisma` 和 `.env` 中的 `DATABASE_URL`。

#### 3.1.4 配置环境变量

在 `ai-proxy-server/.env` 中补充：

```env
DATABASE_URL="postgresql://aichat:aichat_dev@localhost:5432/aichat?schema=public"
```

#### 文件变更清单

| 操作 | 文件路径 |
|------|---------|
| 新增 | `ai-proxy-server/docker-compose.yml` |
| 新增 | `ai-proxy-server/prisma/schema.prisma`（初始为空） |
| 修改 | `ai-proxy-server/package.json`（新增 prisma, @prisma/client, @nestjs/prisma） |
| 修改 | `ai-proxy-server/.env`（新增 DATABASE_URL） |

---

### 阶段二：Schema 定义与迁移

**目标**：Session 表和 Message 表的 Prisma Schema 定义 + 首版迁移

#### 3.2.1 Prisma Schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// 用户表（最小化设计，满足 MVP）
model User {
  id        String    @id @default(uuid()) @db.Uuid
  username  String    @unique
  email     String    @unique
  createdAt DateTime  @default(now()) @map("created_at")
  updatedAt DateTime  @updatedAt @map("updated_at")

  sessions  Session[]

  @@map("users")
}

// 会话表
model Session {
  id        String    @id @default(uuid()) @db.Uuid
  userId    String    @map("user_id") @db.Uuid
  title     String?
  isDeleted Boolean   @default(false) @map("is_deleted")
  createdAt DateTime  @default(now()) @map("created_at")
  updatedAt DateTime  @updatedAt @map("updated_at")

  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  messages  Message[]

  @@index([userId, updatedAt(sort: Desc)])
  @@index([isDeleted])
  @@map("sessions")
}

// 消息表
model Message {
  id        String    @id @default(uuid()) @db.Uuid
  sessionId String    @map("session_id") @db.Uuid
  role      String    // user | assistant | system
  content   String    @db.Text
  metadata  Json?     @db.JsonB
  createdAt DateTime  @default(now()) @map("created_at")

  session   Session   @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@index([sessionId, createdAt])
  @@map("messages")
}
```

**设计说明**：

- `User` 表：最简化设计，MVP 阶段够用。后续可扩展 OAuth、头像等字段
- `Session.userId` + `onDelete: Cascade`：删除用户时级联删除其所有会话和消息
- `Session.updatedAt`：`@updatedAt` 自动维护，有新消息时只需更新 session 即可触发
- `Message.metadata`：`JsonB` 类型，灵活存储 AI 特有的元数据（token 消耗、模型名、finish_reason、tool_calls 参数等）
- **联合索引 `@@index([sessionId, createdAt])`**：覆盖消息列表查询 `WHERE session_id = ? ORDER BY created_at ASC`
- **联合索引 `@@index([userId, updatedAt(sort: Desc)])`**：覆盖侧边栏会话列表查询 `WHERE user_id = ? AND is_deleted = false ORDER BY updated_at DESC`

#### 3.2.2 生成迁移

```bash
npx prisma migrate dev --name init
```

自动生成 `prisma/migrations/YYYYMMDDHHMMSS_init/migration.sql`。

#### 文件变更清单

| 操作 | 文件路径 |
|------|---------|
| 修改 | `ai-proxy-server/prisma/schema.prisma`（完整 Schema） |
| 新增 | `ai-proxy-server/prisma/migrations/*/migration.sql`（自动生成） |

---

### 阶段三：NestJS 模块开发

**目标**：Session CRUD API 可用

#### 3.3.1 清理旧目录 + 创建新模块结构

删除拼写错误的空目录 `src/connaction/`，创建规范的 NestJS 模块：

```
src/
├── prisma/
│   ├── prisma.module.ts      # 全局 PrismaModule
│   └── prisma.service.ts     # PrismaService (extends PrismaClient)
├── session/
│   ├── session.module.ts
│   ├── session.controller.ts
│   ├── session.service.ts
│   └── dto/
│       ├── create-session.dto.ts
│       ├── update-session.dto.ts
│       └── query-session.dto.ts
└── message/
    ├── message.module.ts
    ├── message.service.ts
    └── dto/
        └── create-message.dto.ts
```

#### 3.3.2 PrismaModule（全局模块）

```typescript
// src/prisma/prisma.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

```typescript
// src/prisma/prisma.module.ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

#### 3.3.3 Session API 设计

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/sessions` | `POST` | 创建新会话 |
| `/api/sessions` | `GET` | 获取当前用户的会话列表（游标分页） |
| `/api/sessions/:id` | `GET` | 获取单个会话详情 |
| `/api/sessions/:id` | `PATCH` | 更新会话（标题等） |
| `/api/sessions/:id` | `DELETE` | 软删除会话 |

**SessionService 核心方法**：

```typescript
// 创建会话
async create(userId: string, dto: CreateSessionDto): Promise<Session>

// 获取会话列表（游标分页）
async findAll(userId: string, query: QuerySessionDto): Promise<{ sessions: Session[]; cursor: string | null }>

// 获取单个会话
async findOne(id: string, userId: string): Promise<Session>

// 更新会话（如自动生成标题）
async update(id: string, userId: string, dto: UpdateSessionDto): Promise<Session>

// 软删除会话
async softDelete(id: string, userId: string): Promise<void>
```

**游标分页查询示例**（`GET /api/sessions`）：

```sql
SELECT * FROM sessions
WHERE user_id = $1
  AND is_deleted = false
  AND updated_at < $2  -- cursor
ORDER BY updated_at DESC
LIMIT 20;
```

- 首次请求不传 cursor，取最新 20 条
- 后续请求传上一页最后一条的 `updated_at` 作为 cursor

#### 3.3.4 用户身份占位方案

MVP 阶段不引入完整认证系统，采用极简方案：

**请求头 `X-User-Id`**：前端在所有请求中携带一个固定的用户 ID（开发阶段硬编码，如 `dev-user-001`）。

后续接入认证时，只需将 Guard 解析出的 `req.user.id` 替换掉从 header 读取的逻辑，无需改 SessionService。

```typescript
// 可在 SessionController 中临时处理
@Get()
findAll(@Headers('x-user-id') userId: string, @Query() query: QuerySessionDto) {
  return this.sessionService.findAll(userId, query);
}
```

#### 文件变更清单

| 操作 | 文件路径 |
|------|---------|
| 删除 | `ai-proxy-server/src/connaction/`（拼写错误的空目录） |
| 删除 | `ai-proxy-server/src/module/`（未使用的空目录） |
| 新增 | `ai-proxy-server/src/prisma/prisma.module.ts` |
| 新增 | `ai-proxy-server/src/prisma/prisma.service.ts` |
| 新增 | `ai-proxy-server/src/session/session.module.ts` |
| 新增 | `ai-proxy-server/src/session/session.controller.ts` |
| 新增 | `ai-proxy-server/src/session/session.service.ts` |
| 新增 | `ai-proxy-server/src/session/dto/create-session.dto.ts` |
| 新增 | `ai-proxy-server/src/session/dto/update-session.dto.ts` |
| 新增 | `ai-proxy-server/src/session/dto/query-session.dto.ts` |
| 修改 | `ai-proxy-server/src/app.module.ts`（导入 PrismaModule + SessionModule） |

---

### 阶段四：与现有 Chat Flow 集成

**目标**：前端发起聊天时自动创建会话并持久化消息

#### 4.1 改造 Chat API 流程

现有流程：
```
POST /api/ai/chat  →  AiProxyController  →  内存 this.messages
```

改造后流程：
```
POST /api/ai/chat/stream
  →  AiProxyController
  →  1. 如果 sessionId 为空，创建新 Session
  →  2. 保存用户 Message 到数据库
  →  3. 调用 AI API 获取流式响应
  →  4. 流式响应结束后，保存 Assistant Message 到数据库
  →  5. 更新 Session.updatedAt
```

#### 4.2 前端需配合改动

| 改动点 | 说明 |
|--------|------|
| 首次进入聊天页 | `POST /api/sessions` 创建新会话，拿到 `sessionId` |
| 发送消息 | 请求中携带 `sessionId` |
| 侧边栏会话列表 | `GET /api/sessions` 获取列表，按 `updatedAt` 倒序展示 |
| 切换会话 | 点击侧边栏会话 → `GET /api/sessions/:id/messages` 加载历史消息 |

#### 文件变更清单

| 操作 | 文件路径 |
|------|---------|
| 修改 | `ai-proxy-server/src/ai-proxy/ai-proxy.module.ts`（导入 MessageModule） |
| 修改 | `ai-proxy-server/src/ai-proxy/ai-proxy.controller.ts`（注入 SessionService + MessageService） |
| 修改 | `ai-proxy-server/src/ai-proxy/ai-proxy.service.ts`（扩展响应，返回 sessionId 和 messageId） |
| 新增 | `ai-proxy-server/src/message/message.module.ts` |
| 新增 | `ai-proxy-server/src/message/message.service.ts` |
| 新增 | `ai-proxy-server/src/message/dto/create-message.dto.ts` |

---

## 4. 实施顺序

按依赖关系排序：

```
阶段一：基础设施           → Docker Compose + Prisma 安装 + 连接验证
    ↓
阶段二：Schema + 迁移      → 完整 Prisma Schema + 首版迁移
    ↓
阶段三：Session CRUD       → PrismaModule + SessionModule + 5 个 API
    ↓
阶段四：Chat Flow 集成      → Message 持久化 + 现有 API 改造
    ↓
阶段五：前端联调            → 侧边栏 + 聊天历史加载
```

---

## 5. 关键设计决策摘要

| 决策 | 选择 | 核心理由 |
|------|------|---------|
| 数据库 | PostgreSQL 16 | JSONB + pgvector 未来扩展 + 生态成熟 |
| ORM | Prisma | NestJS 集成最好，迁移工具成熟 |
| 主键策略 | UUID v4 | 安全（不可预测）+ PostgreSQL 原生高效 |
| 分页方式 | 游标分页 | 避免消息插入导致的分页错位 |
| 删除策略 | 软删除 | 保留数据用于未来微调/分析 |
| 用户认证 | `X-User-Id` header（MVP） | 快速启动，后续无缝替换为 JWT Guard |
| 消息元数据 | JSONB | 灵活存储不同 AI 平台的差异化返回数据 |

---

## 6. 验证方案

### 6.1 阶段一验证

```bash
# 启动 PostgreSQL
cd ai-proxy-server && docker compose up -d

# 验证数据库连接
npx prisma db push --force-reset  # 仅开发环境
npx prisma studio  # 打开 Prisma Studio 可视化管理界面
```

### 6.2 阶段二验证

```bash
# 执行迁移
npx prisma migrate dev --name init

# 验证表结构
docker exec -it ai-chat-db psql -U aichat -d aichat -c "\dt"
docker exec -it ai-chat-db psql -U aichat -d aichat -c "\d sessions"
docker exec -it ai-chat-db psql -U aichat -d aichat -c "\d messages"
```

### 6.3 阶段三验证

```bash
# 用 curl 测试完整 CRUD 流程
# 1. 创建会话
curl -X POST http://localhost:3001/api/sessions \
  -H "Content-Type: application/json" \
  -H "X-User-Id: dev-user-001" \
  -d '{"title": "测试会话"}'

# 2. 获取会话列表
curl http://localhost:3001/api/sessions \
  -H "X-User-Id: dev-user-001"

# 3. 获取单个会话
curl http://localhost:3001/api/sessions/{id} \
  -H "X-User-Id: dev-user-001"

# 4. 更新会话标题
curl -X PATCH http://localhost:3001/api/sessions/{id} \
  -H "Content-Type: application/json" \
  -H "X-User-Id: dev-user-001" \
  -d '{"title": "新标题"}'

# 5. 软删除会话
curl -X DELETE http://localhost:3001/api/sessions/{id} \
  -H "X-User-Id: dev-user-001"
```

### 6.4 阶段四验证

```bash
# 在数据库中插入一个会话后
# 发送流式聊天请求，验证消息是否正确持久化
curl -X POST http://localhost:3001/api/ai/chat/stream \
  -H "Content-Type: application/json" \
  -H "X-User-Id: dev-user-001" \
  -d '{"sessionId": "{id}", "messages": [{"role": "user", "content": "你好"}], "platform": "deepseek"}' \
  --no-buffer

# 查询该会话的消息列表
curl "http://localhost:3001/api/sessions/{id}/messages" \
  -H "X-User-Id: dev-user-001"
```

---

## 7. 风险与注意事项

| 风险 | 缓释措施 |
|------|---------|
| Prisma Schema 字段名与 TypeScript 类型名不统一（snake_case vs camelCase） | 使用 `@map()` 和 `@@map()` 保持数据库列名为 snake_case，代码端自动转为 camelCase |
| 游标分页的 cursor 为 NULL 时查询行为异常 | Service 层加 guard：cursor 为空时直接 `ORDER BY DESC LIMIT N` |
| SSE 流式响应中断时消息只保存了一半 | 引入 Message 状态字段 `status: pending/completed/error`，流结束后更新为 completed |
| `X-User-Id` header 可能被伪造 | MVP 阶段可接受，后续接入 JWT Guard 后彻底解决 |
