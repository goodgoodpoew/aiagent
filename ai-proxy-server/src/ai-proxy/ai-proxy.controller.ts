import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Post,
  Query,
  Res,
  UseInterceptors,
} from '@nestjs/common';
import { CacheInterceptor } from '@nestjs/cache-manager';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { ConversationApplicationService } from '../conversation/conversation-application.service';
import { SkipResponseEnvelope } from '../common/response/skip-response-envelope.decorator';
import { ModelProviderRegistryService } from '../model-provider/model-provider-registry.service';
import type { ChatStreamRequestV2 } from '../streaming/dto/chat-stream-v2.dto';
import { StreamOrchestratorService } from '../streaming/services/stream-orchestrator.service';
import { AiProxyService } from './ai-proxy.service';
import { ChatRequestDto, AiPlatform } from './dto/chat.dto';
import { ChatStreamDto } from './dto/chat-stream.dto';
import { StreamFailureCoordinator } from './stream-failure/stream-failure.coordinator';
import type { StreamFailureContext } from './stream-failure/stream-failure.types';
import { StreamCompletionService } from './stream-completion.service';
import { pipeOpenAiStreamToClient, writeSseEvent } from './utils/sse-transform.util';

@Controller('api/ai')
export class AiProxyController {
  private readonly logger = new Logger(AiProxyController.name);

  constructor(
    private readonly aiProxyService: AiProxyService,
    private readonly conversation: ConversationApplicationService,
    private readonly streamCompletion: StreamCompletionService,
    private readonly streamFailureCoordinator: StreamFailureCoordinator,
    private readonly modelProviderRegistry: ModelProviderRegistryService,
    private readonly streamOrchestrator: StreamOrchestratorService,
  ) {}

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(CacheInterceptor)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async chat(@Body() dto: ChatRequestDto) {
    return this.aiProxyService.proxyChat(dto);
  }

  @Post('chat/stream')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @SkipResponseEnvelope()
  async chatStream(
    @Body() dto: ChatStreamDto,
    @Headers('x-user-id') userId: string,
    @Res() res: Response,
  ) {
    // v1 legacy endpoint：仅保留给 Ant Design X 示例页和旧客户端；主聊天页走 chat/stream/v2。
    const query = dto.query;
    const platform = await this.modelProviderRegistry.resolveProvider(dto.provider ?? dto.platform);
    const model = await this.modelProviderRegistry.resolveModel(platform, dto.model, 'llm');
    const effectiveUserId = userId || 'anonymous';
    const autoGenerateSessionName = dto.autoGenerateSessionName ?? true;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const prepared = await this.conversation
      .prepareSendMessage({
        userId: effectiveUserId,
        query,
        sessionId: dto.sessionId,
        requestId: dto.requestId,
        clientMessageId: dto.clientMessageId,
        fileIds: dto.fileIds,
        autoGenerateSessionName,
        platform,
        provider: platform,
        model,
        credentialId: dto.credentialId,
      })
      .catch((error) => {
        writeSseEvent(res, 'error', {
          code: error instanceof NotFoundException ? 'SESSION_NOT_FOUND' : 'CHAT_PREPARE_FAILED',
          message: error instanceof Error ? error.message : '发送前置准备失败',
          retryable: false,
        });
        res.write('event: done\ndata: [DONE]\n\n');
        res.end();
        return undefined;
      });

    if (!prepared) {
      return;
    }

    const { sessionId, userMessageId, assistantMessageId, requestId, isNewSession } = prepared;
    res.setHeader('X-Session-Id', sessionId);

    // 当前请求流也发送会话事件，前端无需等待独立 /sessions/events 通道才知道真实会话 ID。
    if (isNewSession && prepared.session) {
      writeSseEvent(res, 'session.created', {
        sessionId,
        title: prepared.session.title,
        titleStatus: prepared.session.titleStatus,
        createdAt: prepared.session.createdAt,
        updatedAt: prepared.session.updatedAt,
        version: prepared.session.version,
      });
    }

    writeSseEvent(res, 'message.created', {
      sessionId,
      userMessageId,
      assistantMessageId,
      clientMessageId: prepared.clientMessageId,
      requestId,
    });

    if (prepared.isReplay) {
      if (prepared.requestStatus !== 'completed') {
        writeSseEvent(res, 'error', {
          code: 'REQUEST_ALREADY_IN_PROGRESS',
          message: '同一请求正在处理或已失败，请刷新会话消息确认结果',
          retryable: prepared.requestStatus !== 'failed',
        });
      }
      res.write('event: done\ndata: [DONE]\n\n');
      res.end();
      return;
    }

    const paramsDto = new ChatRequestDto();
    paramsDto.platform = platform;
    paramsDto.provider = platform;
    paramsDto.model = model;
    paramsDto.credentialId = dto.credentialId;
    paramsDto.stream = true;
    paramsDto.messages = prepared.llmMessages;
    paramsDto.temperature = dto.temperature;
    paramsDto.max_tokens = dto.max_tokens;

    const failureCtx: StreamFailureContext = {
      sessionId,
      assistantMessageId,
      userId: effectiveUserId,
      platform,
      model,
    };

    this.streamCompletion.handleStart({
      sessionId,
      userMessageId,
      assistantMessageId,
      userId: effectiveUserId,
      query,
      platform,
      model,
      isNewSession,
    });

    try {
      const upstream = await this.aiProxyService.proxyChatStream(paramsDto);

      pipeOpenAiStreamToClient(upstream, res, sessionId, assistantMessageId, {
        onStart: () => {
          this.logger.debug(`流开始: ${sessionId}`);
        },
        onComplete: async (finalContent: string) => {
          this.logger.log(`流完成: ${sessionId}, 内容长度: ${finalContent.length}`);

          await this.streamCompletion.handleComplete({
            sessionId,
            assistantMessageId,
            content: finalContent,
            userId: effectiveUserId,
            isFirstMessage: isNewSession,
          });
        },
        onError: (error: Error) => {
          void this.conversation.markRequestFailed(effectiveUserId, requestId);
          void this.streamFailureCoordinator.dispatch(failureCtx, error, { writeSse: false });
        },
      });
    } catch (error) {
      await this.conversation.markRequestFailed(effectiveUserId, requestId);
      await this.streamFailureCoordinator.dispatch(failureCtx, error, {
        writeSse: true,
        res,
      });
    }
  }

  @Post('chat/stream/v2')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @SkipResponseEnvelope()
  async chatStreamV2(
    @Body() dto: ChatStreamRequestV2,
    @Headers('x-user-id') userId: string,
    @Res() res: Response,
  ) {
    // v2 controller 只做 HTTP 边界接入，协议编排集中在 StreamOrchestratorService。
    return this.streamOrchestrator.streamChat(dto, userId || 'anonymous', res);
  }

  @Get('health')
  @SkipThrottle()
  async health(@Query('platform') platform?: AiPlatform) {
    return this.aiProxyService.healthCheck(platform);
  }
}
