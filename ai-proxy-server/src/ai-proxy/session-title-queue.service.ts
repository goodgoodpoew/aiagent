import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

export interface SessionTitleJob {
  sessionId: string;
  userId: string;
  userMessageId: string;
  baseVersion: number;
  platform: string;
  provider: string;
  model: string;
  credentialId?: string;
  fileIds?: string[];
}

@Injectable()
export class SessionTitleQueueService {
  private readonly logger = new Logger(SessionTitleQueueService.name);

  constructor(
    @InjectQueue('session-title')
    private readonly sessionTitleQueue: Queue<SessionTitleJob>,
  ) {}

  enqueue(payload: SessionTitleJob): void {
    this.sessionTitleQueue
      .add('generate-session-title', payload, {
        jobId: `session-title-${payload.sessionId}`,
        removeOnComplete: 100,
        removeOnFail: 50,
      })
      .catch((err) => {
        this.logger.warn(`自动生成会话标题入队失败: ${payload.sessionId}`, err);
      });
  }
}
