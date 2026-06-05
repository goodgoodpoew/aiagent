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
  /** v2 流需要向客户端输出失败事件时设为 true；流中已自行处理时设为 false。 */
  writeSse: boolean;
  /** 已由调用方完成结构化失败落库时可设为 false，仅保留日志等非持久化 sink。 */
  persist?: boolean;
  /** v2 流统一使用标准事件写入器输出 stream.failed。 */
  writer?: StreamEventWriter;
  stage?: StreamFailureStage;
}

export interface StreamFailureDispatchPayload {
  ctx: StreamFailureContext;
  error: unknown;
  options: StreamFailureDispatchOptions;
  sanitized: SanitizedStreamError;
}
