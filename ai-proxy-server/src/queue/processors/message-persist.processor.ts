import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { MessageService } from '../../message/message.service';

export interface MessagePersistJob {
  messageId: string;
  sessionId: string;
  role: string;
  content: string;
  metadata?: Record<string, unknown>;
}

@Processor('message-persist')
export class MessagePersistProcessor extends WorkerHost {
  private readonly logger = new Logger(MessagePersistProcessor.name);

  constructor(private readonly messageService: MessageService) {
    super();
  }

  async process(job: Job<MessagePersistJob>): Promise<void> {
    const { messageId, sessionId, role, content, metadata } = job.data;
    this.logger.log(`持久化消息 ${messageId} (${role})`);
    await this.messageService.create(sessionId, { role, content, metadata }, messageId);
  }
}
