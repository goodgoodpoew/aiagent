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
 * 所有对外流式聊天响应都应通过 StreamEventEnvelope 输出：
 * - event 行方便浏览器/调试工具识别事件类型
 * - data 行携带完整信封，前端只解析这一种稳定结构
 * - sequence 保留后端写出顺序，便于排查重复/乱序问题
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
    // 信封字段是前端状态机的公共上下文；具体 payload 放在 data 中。
    // 这样 message.part.delta、stream.failed 等不同事件可以复用同一套路由和幂等逻辑。
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
