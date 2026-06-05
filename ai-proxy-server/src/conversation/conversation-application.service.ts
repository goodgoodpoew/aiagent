import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { ChatContextService, type AttachmentReadResult } from '../ai-proxy/chat-context.service';
import { SessionTitleQueueService } from '../ai-proxy/session-title-queue.service';
import { MessageService } from '../message/message.service';
import { PrismaService } from '../prisma/prisma.service';
import { SessionEventService } from '../session/session-event.service';
import { SessionService } from '../session/session.service';
import type { UserMessagePart } from '../streaming/dto/chat-stream-v2.dto';
import type { MessagePart } from '../streaming/protocol/message-part.types';

export interface PrepareSendMessageParams {
  userId: string;
  query: string;
  sessionId?: string;
  requestId?: string;
  clientMessageId?: string;
  inputParts?: UserMessagePart[];
  fileIds?: string[];
  autoGenerateSessionName: boolean;
  platform: string;
  provider: string;
  model: string;
  credentialId?: string;
}

export interface PreparedSendMessage {
  sessionId: string;
  userMessageId: string;
  assistantMessageId: string;
  requestId: string;
  clientMessageId?: string;
  userMessageParts?: MessagePart[];
  session?: {
    title: string | null;
    titleStatus: string;
    version: number;
    createdAt: string;
    updatedAt: string;
  };
  isNewSession: boolean;
  isReplay: boolean;
  requestStatus: string;
  llmMessages: Array<{ role: string; content: string }>;
  attachmentReadResults: AttachmentReadResult[];
}

@Injectable()
export class ConversationApplicationService {
  private readonly logger = new Logger(ConversationApplicationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionService: SessionService,
    private readonly messageService: MessageService,
    private readonly chatContext: ChatContextService,
    private readonly sessionEventService: SessionEventService,
    private readonly sessionTitleQueue: SessionTitleQueueService,
  ) { }

  /**
   * 准备发送消息
   * @param params 
   * @returns {
   *   sessionId: string;
   *   userMessageId: string;
   *   assistantMessageId: string;
   *   requestId: string;
   *   clientMessageId?: string;
   *   userMessageParts?: MessagePart[];
   *   session?: { title: string | null; titleStatus: string; version: number; createdAt: string; updatedAt: string; };
   *   isNewSession: boolean;
   *   isReplay: boolean;
   *   requestStatus: string;
   *   llmMessages: Array<{ role: string; content: string }>;
   *   attachmentReadResults: AttachmentReadResult[];
   * }
   */
  async prepareSendMessage(params: PrepareSendMessageParams): Promise<PreparedSendMessage> {
    // 生成请求 ID
    const requestId = params.requestId || crypto.randomUUID();

    // 检查是否存在相同的请求
    const existingRequest = await this.prisma.chatRequest.findUnique({
      where: {
        // 唯一索引：用户 ID 和请求 ID
        userId_requestId: {
          userId: params.userId,
          requestId,
        },
      },
    });
    // 如果存在相同的请求，则直接返回
    if (existingRequest) {
      await this.sessionService.findOneFresh(existingRequest.sessionId, params.userId);
      return {
        sessionId: existingRequest.sessionId,
        userMessageId: existingRequest.userMessageId,
        assistantMessageId: existingRequest.assistantMessageId,
        requestId,
        clientMessageId: params.clientMessageId,
        userMessageParts: undefined,
        isNewSession: false,
        isReplay: true,
        requestStatus: existingRequest.status,
        llmMessages: [],
        attachmentReadResults: [],
      };
    }
    // 如果不存在会话，则需要新建会话

    const fallbackTitle = params.query.slice(0, 30); // 临时会话标题
    const { session, isNewSession } = await this.sessionService.confirmOrCreateForChat(
      params.userId,
      params.sessionId,
      fallbackTitle,
      { titleStatus: params.autoGenerateSessionName ? 'pending' : 'manual' },
    );

    const userMessageId = crypto.randomUUID(); // 生成用户消息 ID
    const assistantMessageId = crypto.randomUUID(); // 生成助手消息 ID
    const userMessageParts = params.inputParts?.length // 如果存在用户消息部分，则创建用户消息部分
      ? this.createUserMessageParts(userMessageId, params.inputParts) // 创建用户消息部分
      : undefined;
    // 准备上下文
    const { messages: llmMessages, attachmentReadResults } = await this.chatContext.prepareContext({
      sessionId: session.id,
      userId: params.userId,
      query: params.query,
      parts: userMessageParts,
      fileIds: params.fileIds,
      userMessageId,
      requestId,
      clientMessageId: params.clientMessageId,
    });

    // assistant 占位必须在请求模型前落库，流失败或刷新时前端才能恢复这轮回复状态。
    await this.messageService.create(
      session.id,
      {
        role: 'assistant',
        content: '',
        metadata: {
          status: 'streaming',
          requestId,
        },
      },
      assistantMessageId,
    );

    await this.prisma.chatRequest.create({
      data: {
        userId: params.userId,
        requestId,
        sessionId: session.id,
        userMessageId,
        assistantMessageId,
        status: 'streaming',
      },
    });

    if (isNewSession) {
      await this.sessionEventService.publish({
        eventType: 'session.created',
        userId: params.userId,
        sessionId: session.id,
        aggregateVersion: session.version,
        occurredAt: session.createdAt.toISOString(),
        payload: {
          sessionId: session.id,
          title: session.title,
          titleStatus: session.titleStatus,
          createdAt: session.createdAt.toISOString(),
          updatedAt: session.updatedAt.toISOString(),
          version: session.version,
        },
      });
    }

    await this.sessionEventService.publish({
      eventType: 'message.created',
      userId: params.userId,
      sessionId: session.id,
      aggregateVersion: session.version,
      occurredAt: new Date().toISOString(),
      payload: {
        sessionId: session.id,
        userMessageId,
        assistantMessageId,
        clientMessageId: params.clientMessageId,
        requestId,
      },
    });

    if (params.autoGenerateSessionName && isNewSession) {
      this.sessionTitleQueue.enqueue({
        sessionId: session.id,
        userId: params.userId,
        userMessageId,
        baseVersion: session.version,
        platform: params.platform,
        provider: params.provider,
        model: params.model,
        credentialId: params.credentialId,
        fileIds: params.fileIds,
      });
    }

    return {
      sessionId: session.id,
      userMessageId,
      assistantMessageId,
      requestId,
      clientMessageId: params.clientMessageId,
      userMessageParts,
      session: {
        title: session.title,
        titleStatus: session.titleStatus,
        version: session.version,
        createdAt: session.createdAt.toISOString(),
        updatedAt: session.updatedAt.toISOString(),
      },
      isNewSession,
      isReplay: false,
      requestStatus: 'streaming',
      llmMessages,
      attachmentReadResults,
    };
  }

  async markRequestComplete(userId: string, requestId: string): Promise<void> {
    await this.updateRequestStatus(userId, requestId, 'completed');
  }

  async markRequestFailed(userId: string, requestId: string): Promise<void> {
    await this.updateRequestStatus(userId, requestId, 'failed');
  }

  private async updateRequestStatus(userId: string, requestId: string, status: string) {
    try {
      await this.prisma.chatRequest.update({
        where: {
          userId_requestId: {
            userId,
            requestId,
          },
        },
        data: { status },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        this.logger.warn(`更新幂等请求状态时未找到记录: user=${userId}, request=${requestId}`);
        return;
      }
      throw err;
    }
  }
  /**
   * 创建用户消息部分
   * @param messageId 
   * @param parts 
   * @returns 
   */
  private createUserMessageParts(messageId: string, parts: UserMessagePart[]): MessagePart[] {
    return parts
      .map((part, index): MessagePart | undefined => {
        const id = `${messageId}:${part.type}:${index}`; // 生成消息部分 ID
        if (part.type === 'text') { // 如果消息部分类型为文本，则创建文本消息部分
          return {
            id,
            type: 'text',
            text: part.text,
            status: 'done',
          };
        }
        if (part.type === 'file' || part.type === 'image') { // 如果消息部分类型为文件或图片，则创建文件消息部分
          return {
            id,
            type: 'file',
            fileId: part.fileId,
            name: part.type === 'file' ? part.name ?? part.fileId : part.fileId,
            mimeType: part.mimeType,
          };
        }
        if (part.type === 'resource') { // 如果消息部分类型为资源，则创建资源消息部分
          return {
            id,
            type: 'reference',
            title: part.title ?? part.uri,
            uri: part.uri,
            source: part.source === 'local' ? 'file' : part.source,
          };
        }
        return undefined;
      })
      .filter((part): part is MessagePart => Boolean(part));
  }
}
