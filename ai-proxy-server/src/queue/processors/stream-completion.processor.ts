import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MessageService } from '../../message/message.service';
import { SessionService } from '../../session/session.service';
import { SessionEventService } from '../../session/session-event.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  FAILED_ASSISTANT_CONTENT,
  FailedMessageMetadata,
} from '../../ai-proxy/errors/stream-error.util';

export interface StreamCompletionJob {
  sessionId: string;
  assistantMessageId: string;
  content: string;
  userId: string;
  isFirstMessage: boolean;
}

export interface StreamFailureJob {
  sessionId: string;
  assistantMessageId: string;
  userId: string;
  metadata: FailedMessageMetadata;
}

@Processor('stream-completion')
export class StreamCompletionProcessor extends WorkerHost {
  private readonly logger = new Logger(StreamCompletionProcessor.name);

  constructor(
    private readonly messageService: MessageService,
    private readonly sessionService: SessionService,
    private readonly sessionEventService: SessionEventService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<StreamCompletionJob | StreamFailureJob>): Promise<void> {
    if (job.name === 'assistant-message-failed') {
      await this.processFailed(job as Job<StreamFailureJob>);
      return;
    }

    await this.processSuccess(job as Job<StreamCompletionJob>);
  }

  private async processSuccess(job: Job<StreamCompletionJob>): Promise<void> {
    const { sessionId, assistantMessageId, content, userId, isFirstMessage } = job.data;
    this.logger.log(`完成流处理 ${assistantMessageId}`);

    await this.messageService.completeAssistantMessage(sessionId, assistantMessageId, content);

    const session = await this.sessionService.findOneFresh(sessionId, userId);
    await this.prisma.chatRequest.updateMany({
      where: {
        userId,
        assistantMessageId,
      },
      data: { status: 'completed' },
    });

    await this.sessionEventService.publish({
      eventType: 'message.completed',
      userId,
      sessionId,
      aggregateVersion: session.version,
      occurredAt: new Date().toISOString(),
      payload: {
        sessionId,
        messageId: assistantMessageId,
        status: 'done',
        updatedAt: new Date().toISOString(),
        version: session.version,
      },
    });

    if (isFirstMessage) {
      const assistantPreview =
        content.slice(0, 30) + (content.length > 30 ? '...' : '');
      // 仅当会话尚无标题时，用助手回复摘要兜底（避免覆盖 AI 生成的会话名）
      if (!session.title?.trim()) {
        await this.sessionService.update(sessionId, userId, { title: assistantPreview });
      }
    }

    this.logger.debug(`消息已持久化: ${assistantMessageId}`);
  }

  private async processFailed(job: Job<StreamFailureJob>): Promise<void> {
    const { sessionId, assistantMessageId, metadata } = job.data;
    this.logger.log(`失败流处理 ${assistantMessageId}, code=${metadata.code}`);

    try {
      await this.messageService.failAssistantMessage(
        sessionId,
        assistantMessageId,
        FAILED_ASSISTANT_CONTENT,
        metadata as unknown as Record<string, unknown>,
      );

      const request = await this.prisma.chatRequest.findFirst({
        where: {
          assistantMessageId,
        },
      });
      if (request) {
        await this.prisma.chatRequest.update({
          where: { id: request.id },
          data: { status: 'failed' },
        });
        const session = await this.sessionService.findOneFresh(sessionId, request.userId);
        await this.sessionEventService.publish({
          eventType: 'message.failed',
          userId: request.userId,
          sessionId,
          aggregateVersion: session.version,
          occurredAt: new Date().toISOString(),
          payload: {
            sessionId,
            messageId: assistantMessageId,
            status: 'error',
            updatedAt: new Date().toISOString(),
            version: session.version,
            code: metadata.code,
          },
        });
      }
      this.logger.debug(`失败占位消息已持久化: ${assistantMessageId}`);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        this.logger.warn(`失败占位消息已存在，跳过: ${assistantMessageId}`);
        return;
      }
      throw err;
    }
  }
}
