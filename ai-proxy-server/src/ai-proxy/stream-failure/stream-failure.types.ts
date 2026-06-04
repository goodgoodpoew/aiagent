import type { Response } from 'express';
import type { SanitizedStreamError } from '../errors/stream-error.util';
import type { StreamEventWriter } from '@/streaming/protocol/stream-event-writer';
import type { StreamFailureStage } from '@/streaming/protocol/stream-event.types';

export interface StreamFailureContext {
  sessionId?: string;
  assistantMessageId?: string;
  userId: string;
  platform: string;
  model: string;
}

export interface StreamFailureDispatchOptions {
  /** 建连前失败：由协调器写 SSE；流中失败：pipe 已写，为 false */
  writeSse: boolean;
  res?: Response;
  /** v2 流使用标准事件写入器输出 stream.failed；v1 继续使用兼容错误块。 */
  writer?: StreamEventWriter;
  stage?: StreamFailureStage;
}

export interface StreamFailureDispatchPayload {
  ctx: StreamFailureContext;
  error: unknown;
  options: StreamFailureDispatchOptions;
  sanitized: SanitizedStreamError;
}
