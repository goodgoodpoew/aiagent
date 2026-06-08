import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bullmq';
import { AiProxyController } from './ai-proxy.controller';
import { AiProxyService } from './ai-proxy.service';
import { ChatContextService } from './chat-context.service';
import { ContextBuilderService } from './context-builder.service';
import { StreamCompletionService } from './stream-completion.service';
import { SessionTitleQueueService } from './session-title-queue.service';
import { TokenUsageEstimatorService } from './token-usage-estimator.service';
import { SessionTitleProcessor } from './processors/session-title.processor';
import { SessionModule } from '@/session/session.module';
import { MessageModule } from '../message/message.module';
import { ModelProviderModule } from '../model-provider/model-provider.module';
import { FileModule } from '../files/file.module';
import { StreamingModule } from '../streaming/streaming.module';
import { ToolModule } from '../tools/tool.module';
import { OpenAiCompatibleStreamAdapter } from '../streaming/adapters/openai-compatible-stream.adapter';
import { StreamMessageBuilderService } from '../streaming/services/stream-message-builder.service';
import { StreamOrchestratorService } from '../streaming/services/stream-orchestrator.service';
import { StreamFailureCoordinator } from './stream-failure/stream-failure.coordinator';
import { STREAM_FAILURE_SINK } from './stream-failure/stream-failure.sink';
import { LoggingFailureSink } from './stream-failure/sinks/logging-failure.sink';
import { SseFailureSink } from './stream-failure/sinks/sse-failure.sink';
import { PersistenceFailureSink } from './stream-failure/sinks/persistence-failure.sink';
import { ConversationApplicationService } from '../conversation/conversation-application.service';
import { AgentRuntimeEventProjector } from '../agent-runtime/agent-runtime-event-projector.service';
import { AgentRuntimeRunner } from '../agent-runtime/agent-runtime-runner.service';
import { LangGraphAgentEngineAdapter } from '../agent-runtime/adapters/langgraph-agent-engine.adapter';
import { NativeAgentEngineService } from '../agent-runtime/engines/native-agent-engine.service';
import { DefaultToolGatewayService } from '../agent-runtime/gateways/default-tool-gateway.service';
import { AGENT_ENGINE } from '../agent-runtime/ports/agent-engine.port';
import { TOOL_GATEWAY } from '../agent-runtime/ports/tool-gateway.port';

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
    StreamingModule,
    ToolModule,
  ],
  controllers: [AiProxyController],
  providers: [
    AiProxyService,
    ChatContextService,
    ContextBuilderService,
    StreamCompletionService,
    OpenAiCompatibleStreamAdapter,
    StreamMessageBuilderService,
    StreamOrchestratorService,
    AgentRuntimeEventProjector,
    AgentRuntimeRunner,
    DefaultToolGatewayService,
    NativeAgentEngineService,
    LangGraphAgentEngineAdapter,
    {
      provide: TOOL_GATEWAY,
      useExisting: DefaultToolGatewayService,
    },
    {
      provide: AGENT_ENGINE,
      useExisting: NativeAgentEngineService,
    },
    SessionTitleQueueService,
    TokenUsageEstimatorService,
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
  exports: [AiProxyService, StreamFailureCoordinator, TokenUsageEstimatorService],
})
export class AiProxyModule {}
