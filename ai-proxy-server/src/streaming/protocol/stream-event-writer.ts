import type { Response } from 'express';
import {
  STREAM_PROTOCOL_V2,
  type StreamEventEnvelope,
  type StreamEventScope,
  type StreamEventType,
  type StreamProtocolV2,
} from './stream-event.types';

export interface StreamEventWriterBase {
  traceId: string;
  requestId: string;
  protocol: StreamProtocolV2;
}

export interface StreamEventWriterOptions {
  res: Response;
  base: StreamEventWriterBase;
}

/**
 * v2 流式协议的 SSE 写入工具。
 * 当前仅作为新协议基线提供，不替换现有 v1 /api/ai/chat/stream 链路。
 */
export class StreamEventWriter {
  private sequence = 0;

  constructor(private readonly options: StreamEventWriterOptions) {}

  write<T>(
    type: StreamEventType,
    data: T,
    scope?: StreamEventScope,
  ): StreamEventEnvelope<T> | undefined {
    const { res, base } = this.options;
    if (res.writableEnded) return undefined;

    const sequence = ++this.sequence;
    const event: StreamEventEnvelope<T> = {
      protocol: base.protocol,
      id: this.createEventId(sequence),
      type,
      traceId: base.traceId,
      requestId: base.requestId,
      timestamp: new Date().toISOString(),
      sequence,
      ...scope,
      data,
    };

    res.write(`event: ${type}\n`);
    res.write(`id: ${event.id}\n`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);

    return event;
  }

  private createEventId(sequence: number): string {
    return `stream_evt_${Date.now()}_${sequence}`;
  }
}

export function createStreamEventWriter(
  res: Response,
  base: Omit<StreamEventWriterBase, 'protocol'> & { protocol?: StreamProtocolV2 },
): StreamEventWriter {
  return new StreamEventWriter({
    res,
    base: {
      ...base,
      protocol: base.protocol ?? STREAM_PROTOCOL_V2,
    },
  });
}
