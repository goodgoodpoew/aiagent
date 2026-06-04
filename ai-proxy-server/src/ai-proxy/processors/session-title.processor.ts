import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { AiProxyService } from '../ai-proxy.service';
import { SessionService } from '../../session/session.service';
import { SessionEventService } from '../../session/session-event.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { SessionTitleJob } from '../session-title-queue.service';

@Processor('session-title')
export class SessionTitleProcessor extends WorkerHost {
  private readonly logger = new Logger(SessionTitleProcessor.name);

  constructor(
    private readonly aiProxyService: AiProxyService,
    private readonly sessionService: SessionService,
    private readonly sessionEventService: SessionEventService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<SessionTitleJob>): Promise<void> {
    if (job.name !== 'generate-session-title') {
      this.logger.warn(`未知的会话标题任务: ${job.name}`);
      return;
    }

    const {
      sessionId,
      userId,
      userMessageId,
      baseVersion,
      platform,
      provider,
      model,
      credentialId,
      fileIds,
    } = job.data;

    try {
      const session = await this.sessionService.findOneFresh(sessionId, userId);
      if (session.titleStatus === 'manual' || session.version !== baseVersion) {
        this.logger.debug(`会话标题状态已变化，跳过自动更新: ${sessionId}`);
        return;
      }

      const userMessage = await this.prisma.message.findFirst({
        where: {
          id: userMessageId,
          sessionId,
          role: 'user',
        },
      });
      if (!userMessage) {
        this.logger.warn(`标题任务找不到首条用户消息: ${sessionId}/${userMessageId}`);
        await this.sessionService.markAutoTitleFailed({ sessionId, userId, baseVersion });
        return;
      }

      const title = await this.aiProxyService.generateSessionTitle({
        platform,
        provider,
        model,
        credentialId,
        fileIds,
        messages: [
          {
            role: 'user',
            content: userMessage.content,
          },
        ],
      });

      if (!title) {
        this.logger.warn(`自动生成会话标题为空，标记失败: ${sessionId}`);
        await this.sessionService.markAutoTitleFailed({ sessionId, userId, baseVersion });
        return;
      }

      const updatedSession = await this.sessionService.applyAutoTitle({
        sessionId,
        userId,
        title,
        baseVersion,
      });
      if (!updatedSession) {
        this.logger.debug(`自动标题 CAS 未命中，跳过推送: ${sessionId}`);
        return;
      }

      await this.sessionEventService.publishTitleUpdated(userId, updatedSession);
      this.logger.log(`自动生成会话标题完成: ${sessionId}`);
    } catch (err) {
      this.logger.warn(`自动生成会话标题失败: ${sessionId}`, err);
      await this.sessionService.markAutoTitleFailed({ sessionId, userId, baseVersion });
      throw err;
    }
  }
}
