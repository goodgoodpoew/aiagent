import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CHAT_EVENTS, StreamStartPayload } from './events/chat-events';
import {
  FAILED_ASSISTANT_CONTENT,
  SanitizedStreamError,
  buildFailedMessageMetadata,
} from './errors/stream-error.util';

export interface StreamFailurePayload {
  sessionId: string;
  messageId: string;
  sanitized: SanitizedStreamError;
  userId: string;
  platform: string;
  model: string;
}

/**
 * 流生命周期服务
 *
 * 封装流开始/完成/错误三个阶段的事件发送和 BullMQ 入队逻辑，
 * 让 controller 不再直接持有 EventEmitter2 和 Queue 依赖。
 */
@Injectable()
export class StreamCompletionService {
  private readonly logger = new Logger(StreamCompletionService.name);

  constructor(
    private readonly eventEmitter: EventEmitter2,
    @InjectQueue('stream-completion')
    private readonly streamCompletionQueue: Queue,
  ) {}

  /**
   * 流开始时：发送 STREAM_START 事件
   */
  handleStart(payload: StreamStartPayload): void {
    this.eventEmitter.emit(CHAT_EVENTS.STREAM_START, payload);
  }

  /**
   * 流正常完成时：入队持久化 + 发送 STREAM_COMPLETE 事件
   */
  async handleComplete(payload: {
    sessionId: string;
    assistantMessageId: string;
    content: string;
    userId: string;
    isFirstMessage: boolean;
  }): Promise<void> {
    try {
      await this.streamCompletionQueue.add(
        'assistant-message',
        {
          sessionId: payload.sessionId,
          assistantMessageId: payload.assistantMessageId,
          content: payload.content,
          userId: payload.userId,
          isFirstMessage: payload.isFirstMessage,
        },
        {
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      );

      this.eventEmitter.emit(CHAT_EVENTS.STREAM_COMPLETE, {
        sessionId: payload.sessionId,
        messageId: payload.assistantMessageId,
        content: payload.content,
      });
    } catch (err) {
      this.logger.error(`入队 stream-completion 失败`, err);
    }
  }

  /**
   * 流出错时：入队失败占位消息 + 发送 STREAM_ERROR 事件
   * 由 PersistenceFailureSink 调用，Controller 请使用 StreamFailureCoordinator
   */
  handleStreamFailure(payload: StreamFailurePayload): void {
    const metadata = buildFailedMessageMetadata(payload.sanitized, payload.platform, payload.model);

    this.eventEmitter.emit(CHAT_EVENTS.STREAM_ERROR, {
      sessionId: payload.sessionId,
      messageId: payload.messageId,
      code: payload.sanitized.code,
      error: metadata.error,
      content: FAILED_ASSISTANT_CONTENT,
      metadata: metadata as unknown as Record<string, unknown>,
    });

    this.streamCompletionQueue
      .add(
        'assistant-message-failed',
        {
          sessionId: payload.sessionId,
          assistantMessageId: payload.messageId,
          userId: payload.userId,
          metadata,
        },
        {
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      )
      .catch((err) => {
        this.logger.error(`入队 assistant-message-failed 失败`, err);
      });
  }
}
