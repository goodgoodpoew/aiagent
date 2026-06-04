# 文件上传系统独立模块规划

生成日期：2026-06-03

## 1. 目标

建设一个轻量、独立、可扩展的文件上传模块，为聊天、知识库、工具调用等上层能力提供统一的文件资产服务。

核心原则：

- 文件模块只负责文件的上传、存储、元数据、读取和基础解析。
- 聊天模块不直接依赖文件上传实现，只在发送消息时携带文件标识。
- AI 上下文构建阶段根据文件标识读取内容，再转换为大模型可消费的上下文。
- 当前优先支持文本类文件，后续按适配器扩展图片、音频、视频、多模态模型和对象存储。

一句话边界：**消息只保存和传递 `fileIds`，文件内容由文件模块按需读取并提供给上下文构建服务。**

---

## 2. 当前基础

后端已经存在文件模块雏形：

```text
ai-proxy-server/src/files/
  ├── file.module.ts
  ├── file.controller.ts
  ├── file.service.ts
  └── vo/file.update.vo.ts
```

Prisma 中已有 `File` 模型：

```prisma
model File {
  id        String   @id @default(uuid()) @db.Uuid
  url       String   @map("url")
  size      BigInt   @map("size") @db.BigInt
  type      String   @map("type")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
}
```

现状适合作为 MVP 起点，但需要补齐：

- controller/provider 注册。
- 文件名、存储 key、hash、状态、解析内容等字段。
- 上传接口、读取接口、解析接口。
- 与聊天请求之间的 `fileIds` 契约。

---

## 3. 模块边界

### 3.1 FileModule 职责

`FileModule` 只承担文件资产相关能力：

| 能力 | 说明 |
| --- | --- |
| 上传 | 接收 multipart 文件，校验大小、类型、扩展名，写入存储。 |
| 元数据 | 保存文件名、MIME、大小、hash、存储 key、状态、归属用户。 |
| 读取 | 根据 `fileId` 返回文件元数据、原始内容流或解析后的文本。 |
| 解析 | 将文本类文件解析为可注入 LLM 的纯文本片段。 |
| 清理 | 删除文件记录、删除存储对象、清理临时文件。 |
| 适配 | 通过 storage/parser adapter 支持本地磁盘、对象存储、多格式解析。 |

### 3.2 FileModule 不负责

| 非职责 | 归属 |
| --- | --- |
| 聊天消息保存 | `MessageModule` |
| 会话生命周期 | `SessionModule` |
| 调用大模型 | `AiProxyModule` |
| 聊天上下文裁剪 | `ChatContextService` 或后续 `ContextBuilder` |
| 向量检索和 RAG | 后续独立 `KnowledgeModule` 或 `RetrievalModule` |

### 3.3 依赖方向

推荐依赖关系：

```text
FileModule
  ├─ PrismaModule
  └─ ConfigModule

AiProxyModule / ChatContextService
  └─ FileReaderPort（接口）
       └─ FileModule 提供实现
```

为了保持轻量解耦，聊天链路不要直接调用上传逻辑，也不要知道文件存储位置，只依赖一个窄接口：

```typescript
export interface FileReaderPort {
  getReadableContents(fileIds: string[], userId: string): Promise<ReadableFileContent[]>;
}

export interface ReadableFileContent {
  fileId: string;
  name: string;
  type: string;
  content: string;
  tokenEstimate?: number;
}
```

---

## 4. 核心流程

### 4.1 上传流程

```text
前端选择文件
  -> POST /api/files/upload
  -> FileController 校验 multipart
  -> FileService 计算 hash / 生成 storageKey
  -> FileStorage 写入本地磁盘或对象存储
  -> FileParser 尝试解析文本内容
  -> Prisma 保存 File 记录
  -> 返回 fileId + 元数据
```

返回值示例：

```json
{
  "id": "9cc9f4e2-80e2-48b5-862f-cc7b3458df5e",
  "name": "需求说明.md",
  "type": "text/markdown",
  "size": 8342,
  "status": "ready",
  "url": "/api/files/9cc9f4e2-80e2-48b5-862f-cc7b3458df5e/download",
  "createdAt": "2026-06-03T10:20:30.000Z"
}
```

### 4.2 发送消息流程

前端发送消息时只携带标识：

```json
{
  "query": "总结这个文件的主要内容",
  "sessionId": "session-uuid",
  "model": "gpt-4.1-mini",
  "fileIds": [
    "9cc9f4e2-80e2-48b5-862f-cc7b3458df5e"
  ]
}
```

消息落库建议：

- `Message.content` 仍保存用户输入文本。
- `Message.metadata.attachments` 保存轻量附件引用。
- 不把完整文件内容写入消息表，避免消息膨胀和重复存储。

示例：

```json
{
  "attachments": [
    {
      "fileId": "9cc9f4e2-80e2-48b5-862f-cc7b3458df5e",
      "name": "需求说明.md",
      "type": "text/markdown",
      "size": 8342
    }
  ]
}
```

### 4.3 上下文构建流程

```text
ChatContextService.prepareContext(sessionId, query, fileIds)
  -> 保存 user message，metadata 中保存 attachments
  -> 读取历史消息
  -> 调用 FileReaderPort.getReadableContents(fileIds, userId)
  -> 将文件内容转换为 system/user 上下文片段
  -> 合并历史消息 + 当前 query + 文件片段
  -> 交给 AiProxyService
```

推荐注入格式：

```text
用户随消息附带了以下文件内容，请只在相关时引用：

<file id="..." name="需求说明.md" type="text/markdown">
...解析后的文本内容...
</file>
```

注意：

- 文件内容只在本次请求上送，不改变原始用户消息 `content`。
- 超过上下文预算时，优先截断文件内容，而不是截断最近对话。
- 解析失败或文件不存在时，不中断整个聊天，可返回明确的附件读取错误给上下文或前端。

---

## 5. API 设计

### 5.1 上传文件

```http
POST /api/files/upload
Content-Type: multipart/form-data
```

字段：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `file` | File | 是 | 待上传文件。 |
| `purpose` | string | 否 | 使用场景，默认 `chat`。 |

响应：

```typescript
interface FileUploadResponse {
  id: string;
  name: string;
  type: string;
  size: number;
  status: 'uploaded' | 'parsing' | 'ready' | 'failed';
  url?: string;
  createdAt: string;
}
```

### 5.2 查询文件元数据

```http
GET /api/files/:id
```

返回文件名、大小、类型、状态、创建时间，不默认返回完整内容。

### 5.3 读取解析内容

```http
GET /api/files/:id/content
```

用于调试或后续前端预览。生产环境需要权限校验和长度限制。

### 5.4 下载原文件

```http
GET /api/files/:id/download
```

按 storage adapter 读取原始文件流。

### 5.5 删除文件

```http
DELETE /api/files/:id
```

MVP 可以先做软删除，后续由清理任务异步删除存储对象。

---

## 6. 数据模型规划

建议将当前 `File` 表扩展为更完整的资产表：

```prisma
model File {
  id          String    @id @default(uuid()) @db.Uuid
  userId      String?   @map("user_id") @db.Uuid
  name        String
  type        String
  extension   String?
  size        BigInt    @db.BigInt
  hash        String?
  storageKey  String    @map("storage_key")
  url         String?
  status      String    @default("uploaded")
  purpose     String    @default("chat")
  textContent String?   @map("text_content") @db.Text
  metadata    Json?     @db.JsonB
  isDeleted   Boolean   @default(false) @map("is_deleted")
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")

  @@index([userId, createdAt(sort: Desc)])
  @@index([hash])
  @@index([status])
  @@map("files")
}
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `userId` | 文件归属用户。认证未完成前可为空或使用开发用户。 |
| `name` | 原始文件名，用于展示和上下文标注。 |
| `type` | MIME 类型。 |
| `extension` | 文件扩展名，辅助校验和解析。 |
| `hash` | 内容 hash，用于去重、审计和缓存。 |
| `storageKey` | 存储层内部 key，不直接暴露给前端。 |
| `url` | 可选下载 URL；本地存储时可以由接口动态生成。 |
| `status` | `uploaded`、`parsing`、`ready`、`failed`。 |
| `purpose` | `chat`、`avatar`、`knowledge` 等使用场景。 |
| `textContent` | MVP 阶段保存解析后的文本内容。 |
| `metadata` | 页数、编码、解析错误、token 估算等扩展信息。 |

### 是否需要消息-文件关联表

MVP 不需要新增关联表，使用 `Message.metadata.attachments` 保存快照即可，理由：

- 聊天发送时只需要知道当次消息携带了哪些文件。
- 文件模块和消息模块不需要互相维护强外键。
- 删除文件不应破坏历史消息展示，消息里保留附件名、大小、类型快照即可。

后续如果需要统计“某文件被哪些消息引用”，再补 `MessageAttachment` 表：

```prisma
model MessageAttachment {
  id        String   @id @default(uuid()) @db.Uuid
  messageId String   @map("message_id") @db.Uuid
  fileId    String   @map("file_id") @db.Uuid
  createdAt DateTime @default(now()) @map("created_at")

  @@unique([messageId, fileId])
  @@index([fileId])
  @@map("message_attachments")
}
```

---

## 7. 存储与解析适配器

### 7.1 Storage Adapter

定义统一存储接口：

```typescript
export interface FileStorage {
  save(input: SaveFileInput): Promise<StoredFile>;
  read(storageKey: string): Promise<NodeJS.ReadableStream>;
  remove(storageKey: string): Promise<void>;
}
```

MVP 实现：

| 实现 | 说明 |
| --- | --- |
| `LocalFileStorage` | 保存到 `uploads/` 目录，适合开发和个人部署。 |

后续扩展：

| 实现 | 说明 |
| --- | --- |
| `S3FileStorage` | 兼容 AWS S3、MinIO、Cloudflare R2。 |
| `OssFileStorage` | 阿里云 OSS。 |
| `CosFileStorage` | 腾讯云 COS。 |

### 7.2 Parser Adapter

定义统一解析接口：

```typescript
export interface FileParser {
  supports(file: UploadedFileMeta): boolean;
  parse(input: ParseFileInput): Promise<ParsedFileContent>;
}
```

MVP 支持：

| 类型 | 解析策略 |
| --- | --- |
| `.txt` | 按 UTF-8 读取。 |
| `.md` | 按 UTF-8 读取，保留 Markdown。 |
| `.json` | 格式化或原样读取。 |
| `.csv` | 转为文本表格摘要或原始 CSV。 |

第二阶段支持：

| 类型 | 解析策略 |
| --- | --- |
| `.pdf` | 使用 PDF 文本提取库。 |
| `.docx` | 使用 docx 解析库提取段落。 |
| 图片 | 暂存原图，等多模态模型或 OCR 接入后解析。 |

---

## 8. 聊天链路改造点

### 8.1 DTO 增加 fileIds

`ChatStreamDto` 增加：

```typescript
@IsOptional()
@IsArray()
@IsString({ each: true })
fileIds?: string[];
```

`ChatRequestDto` 增加：

```typescript
fileIds?: string[];
```

### 8.2 ChatContextService 增加附件上下文

当前签名：

```typescript
prepareContext(sessionId: string, query: string)
```

建议调整为：

```typescript
prepareContext(params: {
  sessionId: string;
  userId: string;
  query: string;
  fileIds?: string[];
})
```

内部职责：

- 保存 user message。
- 将附件快照写入 `Message.metadata.attachments`。
- 读取历史消息。
- 读取文件解析文本。
- 组装 LLM messages。

### 8.3 LLM 上下文拼接策略

推荐顺序：

```text
system prompt
历史消息
当前用户附件内容说明
当前用户 query
```

文件内容可以作为当前 user message 的前缀，也可以作为单独 system message。MVP 推荐作为当前 user message 前缀，便于和用户问题绑定：

```typescript
const userContent = [
  buildAttachmentContext(fileContents),
  query,
].filter(Boolean).join('\n\n');
```

### 8.4 解耦约束

聊天模块只允许依赖：

```typescript
FileReaderPort.getReadableContents(fileIds, userId)
```

不允许在聊天链路中出现：

- 文件上传逻辑。
- 存储路径拼接。
- MIME 解析判断。
- 文件删除或状态变更。
- 直接访问 `File` Prisma model 的散落查询。

---

## 9. 前端规划

### 9.1 上传组件位置

建议先接入聊天输入框附近：

```text
Sender
  ├─ 输入框
  ├─ 附件按钮
  ├─ 上传进度
  └─ 已上传文件列表
```

### 9.2 前端状态

前端只维护轻量附件状态：

```typescript
interface ChatAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  status: 'uploading' | 'ready' | 'failed';
}
```

发送消息时：

```typescript
{
  query,
  sessionId,
  fileIds: attachments.filter(item => item.status === 'ready').map(item => item.id)
}
```

### 9.3 展示策略

- 消息气泡展示附件卡片，只显示文件名、类型、大小和状态。
- 不在消息气泡里展示完整文件内容。
- 失败文件不随消息发送，但可保留错误提示和重试按钮。

---

## 10. 安全与限制

MVP 即需要加入的限制：

| 限制项 | 建议 |
| --- | --- |
| 单文件大小 | 默认 10 MB，可配置。 |
| 单次消息附件数 | 默认 5 个，可配置。 |
| MIME allowlist | `text/plain`、`text/markdown`、`application/json`、`text/csv`。 |
| 文件名处理 | 不信任原始文件名，只用于展示；存储 key 由服务端生成。 |
| 用户隔离 | 读取文件时校验 `userId`。 |
| 路径安全 | 禁止直接用用户文件名拼接路径。 |
| 内容注入 | 文件内容用明确标签包裹，提示模型这是用户提供的附件内容。 |

后续增强：

- 病毒扫描。
- 敏感信息检测。
- 临时下载链接。
- 文件生命周期和过期清理。
- 图片 OCR 或多模态直接传模型。

---

## 11. 实施阶段

### 阶段一：MVP 文本文件上传

目标：完成独立文件模块闭环，聊天请求能携带 `fileIds` 并注入文本内容。

变更清单：

| 操作 | 文件 |
| --- | --- |
| 修改 | `ai-proxy-server/src/files/file.module.ts` 注册 controller/service。 |
| 新增/完善 | `ai-proxy-server/src/files/file.controller.ts` 上传、查询、读取接口。 |
| 完善 | `ai-proxy-server/src/files/file.service.ts` 上传、保存、解析、读取。 |
| 新增 | `ai-proxy-server/src/files/storage/local-file.storage.ts` 本地存储适配器。 |
| 新增 | `ai-proxy-server/src/files/parser/text-file.parser.ts` 文本解析器。 |
| 修改 | `ai-proxy-server/prisma/schema.prisma` 扩展 `File` 模型。 |
| 新增 | `ai-proxy-server/prisma/migrations/*_file_module/migration.sql`。 |
| 修改 | `ai-proxy-server/src/app.module.ts` 注册 `FileModule`。 |
| 修改 | `ai-proxy-server/src/ai-proxy/dto/chat-stream.dto.ts` 增加 `fileIds`。 |
| 修改 | `ai-proxy-server/src/ai-proxy/chat-context.service.ts` 读取文件内容并拼接上下文。 |
| 修改 | `antdXStudy/src/service/chat-shared.ts` 请求体携带 `fileIds`。 |

### 阶段二：附件体验完善

目标：前端完成可用的附件交互。

- Sender 增加上传入口。
- 展示上传中、上传成功、上传失败。
- 消息气泡展示附件卡片。
- 发送后清空当前附件列表。
- 上传失败支持重试和移除。

### 阶段三：解析能力扩展

目标：支持更常见办公文件。

- PDF 文本提取。
- DOCX 文本提取。
- CSV 表格摘要。
- 解析状态异步化：`uploaded -> parsing -> ready/failed`。
- 大文件按片段截断或摘要。

### 阶段四：存储扩展

目标：替换本地存储为对象存储时不影响业务层。

- 增加 `FILE_STORAGE_DRIVER=local|s3|minio`。
- 增加 S3/R2/MinIO 适配器。
- 下载接口使用临时签名或服务端转发。
- 清理任务删除孤立文件。

---

## 12. 验证清单

后端：

- 上传合法文本文件，返回 `fileId`。
- 上传非法 MIME，返回 400。
- 上传超限文件，返回 413 或 400。
- 根据 `fileId` 查询元数据。
- 根据 `fileId` 读取解析内容。
- 删除文件后再次读取返回不可用。
- 聊天请求携带 `fileIds`，上游 messages 中包含文件内容。
- 聊天请求携带不存在或无权限的 `fileId`，返回清晰错误或跳过附件。

前端：

- 选择文件后展示上传进度。
- 上传成功后发送消息携带 `fileIds`。
- 发送中禁用重复上传/发送的冲突操作。
- 消息列表展示附件快照。
- 刷新页面后历史消息仍能展示附件名。

---

## 13. 推荐落地顺序

1. 先扩展数据库 `File` 表，补齐元数据字段。
2. 实现 `FileModule` 的本地上传、查询、读取能力。
3. 给 `ChatStreamDto` 和前端请求增加 `fileIds`。
4. 在 `ChatContextService` 中通过 `FileReaderPort` 读取文件文本并注入 LLM。
5. 前端 Sender 增加附件上传和消息附件展示。
6. 最后再扩展 PDF、DOCX、对象存储和异步解析。

这个顺序能保证文件系统作为独立服务先跑通，同时聊天链路只增加一个很薄的 `fileIds -> readable content` 接口，不会把上传系统和 AI 代理耦合在一起。
