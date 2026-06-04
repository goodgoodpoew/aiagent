import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  CHAT_EVENTS,
  StreamStartPayload,
  StreamCompletePayload,
  StreamErrorPayload,
} from '../ai-proxy/events/chat-events';
import { SessionCacheService, CachedMessage } from './session-cache.service';
import { MessageService } from '../message/message.service';
import { Prisma } from '@prisma/client';

/**
 * 聊天事件监听器
 *
 * 职责：
 * - STREAM_START：记录流开始日志
 * - STREAM_COMPLETE：同步更新消息缓存，确保下次请求命中缓存
 * - STREAM_ERROR：追加失败占位消息到缓存
 *
 * 持久化由 BullMQ StreamCompletionProcessor 异步处理（仅写 DB，不碰缓存）
 */
@Injectable()
export class ChatPersistenceListener {
  private readonly logger = new Logger(ChatPersistenceListener.name);

  constructor(
    private readonly sessionCache: SessionCacheService,
    private readonly messageService: MessageService,
  ) {}

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

  private async loadCachedMessages(sessionId: string): Promise<CachedMessage[]> {
    let cachedMsgs = await this.sessionCache.getMessages(sessionId);

    if (!cachedMsgs) {
      this.logger.debug(`缓存缺失，从 DB 重建: ${sessionId}`);
      const dbResult = await this.messageService.findBySessionId(sessionId);
      cachedMsgs = dbResult.messages.map((m) => this.toCachedMessage(m));
    }

    return cachedMsgs;
  }

  @OnEvent(CHAT_EVENTS.STREAM_START)
  async handleStreamStart(payload: StreamStartPayload) {
    this.logger.log(
      `流开始: session=${payload.sessionId}, isNew=${payload.isNewSession}, platform=${payload.platform}`,
    );
  }

  @OnEvent(CHAT_EVENTS.STREAM_COMPLETE)
  async handleStreamComplete(payload: StreamCompletePayload) {
    this.logger.log(`流完成: session=${payload.sessionId}, 内容长度=${payload.content.length}`);

    try {
      const cachedMsgs = await this.loadCachedMessages(payload.sessionId);

      const existing = cachedMsgs.find((m) => m.id === payload.messageId);
      if (existing) {
        existing.content = payload.content;
        existing.role = 'assistant';
      } else {
        cachedMsgs.push({
          id: payload.messageId,
          role: 'assistant',
          content: payload.content,
          createdAt: new Date().toISOString(),
        });
      }

      await this.sessionCache.cacheMessages(payload.sessionId, cachedMsgs);
      this.logger.debug(`缓存已更新 (${cachedMsgs.length} 条): ${payload.sessionId}`);
    } catch (err) {
      this.logger.warn(`更新消息缓存失败: ${payload.sessionId}`, err);
    }
  }

  @OnEvent(CHAT_EVENTS.STREAM_ERROR)
  async handleStreamError(payload: StreamErrorPayload) {
    this.logger.warn(
      `流错误: session=${payload.sessionId}, code=${payload.code}, error=${payload.error}`,
    );

    try {
      const cachedMsgs = await this.loadCachedMessages(payload.sessionId);

      const existing = cachedMsgs.find((m) => m.id === payload.messageId);
      if (existing) {
        existing.content = payload.content;
        existing.role = 'assistant';
        existing.metadata = payload.metadata;
      } else {
        cachedMsgs.push({
          id: payload.messageId,
          role: 'assistant',
          content: payload.content,
          createdAt: new Date().toISOString(),
          metadata: payload.metadata,
        });
      }

      await this.sessionCache.cacheMessages(payload.sessionId, cachedMsgs);
      this.logger.debug(`失败消息缓存已更新 (${cachedMsgs.length} 条): ${payload.sessionId}`);
    } catch (err) {
      this.logger.warn(`更新失败消息缓存失败: ${payload.sessionId}`, err);
    }
  }
}
