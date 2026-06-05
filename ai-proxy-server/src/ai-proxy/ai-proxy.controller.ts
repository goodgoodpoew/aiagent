import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Res,
  UseInterceptors,
} from '@nestjs/common';
import { CacheInterceptor } from '@nestjs/cache-manager';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { SkipResponseEnvelope } from '../common/response/skip-response-envelope.decorator';
import type { ChatStreamRequestV2 } from '../streaming/dto/chat-stream-v2.dto';
import { StreamOrchestratorService } from '../streaming/services/stream-orchestrator.service';
import { AiProxyService } from './ai-proxy.service';
import { ChatRequestDto, AiPlatform } from './dto/chat.dto';

@Controller('api/ai')
export class AiProxyController {
  constructor(
    private readonly aiProxyService: AiProxyService,
    private readonly streamOrchestrator: StreamOrchestratorService,
  ) {}

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(CacheInterceptor)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async chat(@Body() dto: ChatRequestDto) {
    return this.aiProxyService.proxyChat(dto);
  }

  @Post('chat/stream/v2')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @SkipResponseEnvelope()
  async chatStreamV2(
    @Body() dto: ChatStreamRequestV2,
    @Headers('x-user-id') userId: string,
    @Res() res: Response,
  ) {
    // v2 controller 只做 HTTP/SSE 边界接入：接收前端 POST body 和 Express Response。
    // 会话创建、上游请求、provider chunk 转换、事件写出都集中在 StreamOrchestratorService。
    return this.streamOrchestrator.streamChat(dto, userId || 'anonymous', res);
  }

  @Get('health')
  @SkipThrottle()
  async health(@Query('platform') platform?: AiPlatform) {
    return this.aiProxyService.healthCheck(platform);
  }
}
