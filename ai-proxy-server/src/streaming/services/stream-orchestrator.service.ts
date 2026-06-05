import { Inject, Injectable } from '@nestjs/common';
import type { Response } from 'express';
import * as crypto from 'crypto';
import {
  STREAM_EVENT_WRITER_FACTORY,
  type StreamEventWriterFactory,
} from '../streaming.module';
import type { ChatStreamRequestV2 } from '../dto/chat-stream-v2.dto';
import { AgentRuntimeEventProjector } from '@/agent-runtime/agent-runtime-event-projector.service';
import { AGENT_ENGINE, type AgentEnginePort } from '@/agent-runtime/ports/agent-engine.port';

@Injectable()
export class StreamOrchestratorService {
  constructor(
    @Inject(AGENT_ENGINE)
    private readonly agentEngine: AgentEnginePort,
    private readonly projector: AgentRuntimeEventProjector,
    @Inject(STREAM_EVENT_WRITER_FACTORY)
    private readonly createWriter: StreamEventWriterFactory,
  ) {}

  async streamChat(dto: ChatStreamRequestV2, userId: string, res: Response): Promise<void> {
    this.prepareSseResponse(res);

    const requestId = dto.requestId || crypto.randomUUID();
    const traceId = crypto.randomUUID();
    const writer = this.createWriter(res, { requestId, traceId });

    for await (const event of this.agentEngine.run({
      dto,
      userId,
      requestId,
      traceId,
    })) {
      this.projector.project(event, { res, writer });
    }

    this.endResponse(res);
  }

  private prepareSseResponse(res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
  }

  private endResponse(res: Response) {
    if (!res.writableEnded) {
      res.end();
    }
  }
}
