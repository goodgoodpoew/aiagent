import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { MessageService } from '../message/message.service';
import { SessionCacheService, CachedMessage } from '../session/session-cache.service';
import { MessageWithMetadata } from '../message/message-filter.util';
import { Prisma } from '@prisma/client';
import { SessionService } from '../session/session.service';
import { MESSAGE_PROTOCOL_V2 } from '../message/dto/create-message.dto';
import { ContextBuilderService } from './context-builder.service';
import type { MessagePart } from '@/streaming/protocol/message-part.types';
import type {
  AttachmentReadResult,
  FileReadToolResult,
} from '@/tools/file-read-tool.types';

export type { AttachmentReadResult } from '@/tools/file-read-tool.types';

export interface PrepareContextParams {
  sessionId: string;
  userId: string;
  query: string;
  parts?: MessagePart[];
  fileIds?: string[];
  userMessageId?: string;
  requestId?: string;
  clientMessageId?: string;
  attachmentRead?: FileReadToolResult;
}

/**
 * 聊天上下文服务
 *
 * 职责：
 * - 保存当前用户消息到 DB（含附件快照）
 * - 使消息缓存失效
 * - 获取全量历史消息
 * - 消费运行时文件读取工作结果，记录模型实际可读附件
 */
@Injectable()
export class ChatContextService {
  private readonly logger = new Logger(ChatContextService.name);

  constructor(
    private readonly messageService: MessageService,
    private readonly sessionCache: SessionCacheService,
    private readonly sessionService: SessionService,
    private readonly contextBuilder: ContextBuilderService,
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
    const {
      sessionId,
      userId,
      query,
      parts,
      fileIds,
      requestId,
      clientMessageId,
      attachmentRead,
    } = params;

    // 1. 消费本轮附件读取结果；历史会话文件不自动进入本轮模型上下文。
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

    if (effectiveFileIds.length > 0 && attachmentRead) {
      readableFileIds = attachmentRead.readableFileIds;

      const readableById = new Map(attachmentRead.readable.map((file) => [file.fileId, file] as const));
      const unavailableById = new Map(attachmentRead.unavailable.map((file) => [file.fileId, file] as const));
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

      attachments = attachmentRead.attachments;

      if (attachmentRead.unavailable.length > 0) {
        unavailableAttachments = attachmentRead.unavailable.map((file) => {
          const fallback = requestedFileMeta.get(file.fileId);
          return {
            ...file,
            name: file.name ?? fallback?.name,
            type: file.type ?? fallback?.mimeType,
          };
        });
        this.logger.warn(
          `部分附件未进入模型上下文: session=${sessionId}, files=${attachmentRead.unavailable
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

    const context = this.contextBuilder.build({ rawMessages });

    this.logger.debug(
      `会话 ${sessionId} 上下文装配: 原始=${context.debug.rawMessageCount}, 候选=${context.debug.candidateMessageCount}, 选入=${context.debug.selectedMessageCount}, token=${context.debug.estimatedPromptTokens}/${context.debug.maxPromptTokens}, 裁剪=${context.debug.truncated ? '是' : '否'}`,
    );

    return { userMessageId, messages: context.messages, attachmentReadResults };
  }
}
