import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bullmq';
import { AiProxyController } from './ai-proxy.controller';
import { AiProxyService } from './ai-proxy.service';
import { ChatContextService } from './chat-context.service';
import { StreamCompletionService } from './stream-completion.service';
import { SessionTitleQueueService } from './session-title-queue.service';
import { SessionTitleProcessor } from './processors/session-title.processor';
import { SessionModule } from '@/session/session.module';
import { MessageModule } from '../message/message.module';
import { ModelProviderModule } from '../model-provider/model-provider.module';
import { FileModule } from '../files/file.module';
import { StreamFailureCoordinator } from './stream-failure/stream-failure.coordinator';
import { STREAM_FAILURE_SINK } from './stream-failure/stream-failure.sink';
import { LoggingFailureSink } from './stream-failure/sinks/logging-failure.sink';
import { SseFailureSink } from './stream-failure/sinks/sse-failure.sink';
import { PersistenceFailureSink } from './stream-failure/sinks/persistence-failure.sink';
import { ConversationApplicationService } from '../conversation/conversation-application.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 120000,
      maxRedirects: 5,
    }),
    BullModule.registerQueue({ name: 'stream-completion' }, { name: 'session-title' }),
    SessionModule,
    MessageModule,
    ModelProviderModule,
    FileModule,
  ],
  controllers: [AiProxyController],
  providers: [
    AiProxyService,
    ChatContextService,
    StreamCompletionService,
    SessionTitleQueueService,
    ConversationApplicationService,
    SessionTitleProcessor,
    LoggingFailureSink,
    SseFailureSink,
    PersistenceFailureSink,
    {
      provide: STREAM_FAILURE_SINK,
      useFactory: (
        logging: LoggingFailureSink,
        sse: SseFailureSink,
        persistence: PersistenceFailureSink,
      ) => [logging, sse, persistence],
      inject: [LoggingFailureSink, SseFailureSink, PersistenceFailureSink],
    },
    StreamFailureCoordinator,
  ],
  exports: [AiProxyService, StreamFailureCoordinator],
})
export class AiProxyModule {}
