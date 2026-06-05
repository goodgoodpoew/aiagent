import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { MessageService } from '../message/message.service';
import { SessionCacheService, CachedMessage } from '../session/session-cache.service';
import { toLlmMessages, MessageWithMetadata } from '../message/message-filter.util';
import { FileService } from '../files/file.service';
import { ReadableFileContent } from '../files/file-reader.port';
import { Prisma } from '@prisma/client';
import { SessionService } from '../session/session.service';
import { MESSAGE_PROTOCOL_V2 } from '../message/dto/create-message.dto';
import type { MessagePart } from '@/streaming/protocol/message-part.types';

export interface PrepareContextParams {
  sessionId: string;
  userId: string;
  query: string;
  parts?: MessagePart[];
  fileIds?: string[];
  userMessageId?: string;
  requestId?: string;
  clientMessageId?: string;
}

export interface AttachmentReadResult {
  fileId: string;
  name: string;
  mimeType?: string;
  tokenEstimate?: number;
  status: 'done' | 'failed';
  reason?: string;
}

/**
 * 构建附件上下文文本，注入到 LLM messages
 */
function buildAttachmentContext(files: ReadableFileContent[]): string {
  if (!files.length) return '';

  const blocks = files.map(
    (f) => `<file id="${f.fileId}" name="${f.name}" type="${f.type}">\n${f.content}\n</file>`,
  );

  return `用户随消息附带了以下文件内容，请只在相关时引用：\n\n${blocks.join('\n\n')}`;
}

/**
 * 聊天上下文服务
 *
 * 职责：
 * - 保存当前用户消息到 DB（含附件快照）
 * - 使消息缓存失效
 * - 获取全量历史消息
 * - 通过 FileReaderPort 读取文件内容并拼接为 LLM 上下文
 */
@Injectable()
export class ChatContextService {
  private readonly logger = new Logger(ChatContextService.name);

  constructor(
    private readonly messageService: MessageService,
    private readonly sessionCache: SessionCacheService,
    private readonly fileService: FileService,
    private readonly sessionService: SessionService,
  ) { }

  private toCachedMessage(m: {
    id: string;
    role: string;
    content: string;
    metadata: Prisma.JsonValue | null;
    createdAt: Date;
  }): CachedMessage {
    return {
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
      ...(m.metadata != null && typeof m.metadata === 'object' && !Array.isArray(m.metadata)
        ? { metadata: m.metadata as Record<string, unknown> }
        : {}),
    };
  }

  async prepareContext(params: PrepareContextParams): Promise<{
    userMessageId: string;
    messages: Array<{ role: string; content: string }>;
    attachmentReadResults: AttachmentReadResult[];
  }> {
    // 解构出基本信息
    const { sessionId, userId, query, parts, fileIds, requestId, clientMessageId } = params;

    // 1. 读取本轮附件内容并构建上下文；历史会话文件不自动进入本轮模型上下文。
    let attachmentContext = ''; // 附件上下文
    let attachments: unknown = undefined; // 附件
    let unavailableAttachments: unknown = undefined; // 不可用附件
    const effectiveFileIds = fileIds?.length ? fileIds : []; // 有效文件 ID
    let readableFileIds: string[] = []; // 可读文件 ID
    const attachmentReadResults: AttachmentReadResult[] = []; // 附件读取结果
    // 
    const requestedFileMeta = new Map(
      (parts ?? [])
        .filter((part): part is Extract<MessagePart, { type: 'file' }> => part.type === 'file')
        .map((part) => [part.fileId, part] as const),
    );

    if (effectiveFileIds.length > 0) {
      const detail = await this.fileService.getReadableContentsDetailed(effectiveFileIds, userId);
      attachmentContext = buildAttachmentContext(detail.readable);
      readableFileIds = detail.readable.map((f) => f.fileId);

      const readableById = new Map(detail.readable.map((file) => [file.fileId, file] as const));
      const unavailableById = new Map(detail.unavailable.map((file) => [file.fileId, file] as const));
      effectiveFileIds.forEach((fileId) => {
        const readable = readableById.get(fileId);
        if (readable) {
          attachmentReadResults.push({
            fileId: readable.fileId,
            name: readable.name,
            mimeType: readable.type,
            tokenEstimate: readable.tokenEstimate,
            status: 'done',
          });
          return;
        }

        const unavailable = unavailableById.get(fileId);
        if (unavailable) {
          const fallback = requestedFileMeta.get(unavailable.fileId);
          attachmentReadResults.push({
            fileId: unavailable.fileId,
            name: unavailable.name ?? fallback?.name ?? unavailable.fileId,
            mimeType: unavailable.type ?? fallback?.mimeType,
            status: 'failed',
            reason: unavailable.reason,
          });
        }
      });

      attachments = detail.readable.map((f) => ({
        fileId: f.fileId,
        name: f.name,
        type: f.type,
        status: 'ready',
      }));

      if (detail.unavailable.length > 0) {
        unavailableAttachments = detail.unavailable;
        this.logger.warn(
          `部分附件未进入模型上下文: session=${sessionId}, files=${detail.unavailable
            .map((item) => item.fileId)
            .join(',')}`,
        );
      }
    }

    // 2. 构建消息 metadata：content 是文本投影，parts 才是刷新后恢复结构化消息的事实来源。
    const metadata: Record<string, unknown> = {
      status: 'done',
    };
    if (requestId) {
      metadata.requestId = requestId;
    }
    if (clientMessageId) {
      metadata.clientMessageId = clientMessageId;
    }
    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
      metadata.attachments = attachments;
    }
    if (unavailableAttachments) {
      metadata.unavailableAttachments = unavailableAttachments;
    }
    if (parts?.length) {
      metadata.protocol = MESSAGE_PROTOCOL_V2;
      metadata.parts = parts;
    }

    // 3. 保存用户消息
    const userMessageId = params.userMessageId ?? crypto.randomUUID();
    await this.messageService.create(
      sessionId,
      {
        role: 'user',
        content: query,
        metadata,
      },
      userMessageId,
    );

    if (effectiveFileIds.length > 0) {
      // 会话关联用于归档，消息关联才决定本轮模型实际读取了哪些文件。
      await this.sessionService.attachFilesToSession(userId, sessionId, effectiveFileIds);
      if (readableFileIds.length > 0) {
        await this.sessionService.attachFilesToMessage(
          userId,
          sessionId,
          userMessageId,
          readableFileIds,
        );
      }
    }

    // 4. 使消息缓存失效
    await this.sessionCache.invalidateMessages(sessionId);

    // 5. 获取全量历史消息
    let rawMessages: MessageWithMetadata[];

    const cachedMessages = await this.sessionCache.getMessages(sessionId);
    if (cachedMessages && cachedMessages.length > 0) {
      rawMessages = cachedMessages.map((m) => ({
        role: m.role,
        content: m.content,
        metadata: m.metadata,
      }));
    } else {
      const dbResult = await this.messageService.findBySessionId(sessionId);
      rawMessages = dbResult.messages.map((m) => ({
        role: m.role,
        content: m.content,
        metadata: m.metadata,
      }));

      if (dbResult.messages.length > 0) {
        await this.sessionCache.cacheMessages(
          sessionId,
          dbResult.messages.map((m) => this.toCachedMessage(m)),
        );
      }
    }

    const messages = toLlmMessages(rawMessages);

    // 6. 将附件上下文注入到最后一条用户消息中
    if (attachmentContext && messages.length > 0) {
      const last = messages[messages.length - 1];
      if (last.role === 'user') {
        last.content = `${attachmentContext}\n\n${last.content}`;
      }
    }

    this.logger.debug(
      `会话 ${sessionId} 携带 ${messages.length} 条历史上送 LLM（原始 ${rawMessages.length} 条）`,
    );

    return { userMessageId, messages, attachmentReadResults };
  }
}
