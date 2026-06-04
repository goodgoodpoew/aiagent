import type { Response } from 'express';
import type { SanitizedStreamError } from '../errors/stream-error.util';

export interface StreamFailureContext {
  sessionId: string;
  assistantMessageId: string;
  userId: string;
  platform: string;
  model: string;
}

export interface StreamFailureDispatchOptions {
  /** 建连前失败：由协调器写 SSE；流中失败：pipe 已写，为 false */
  writeSse: boolean;
  res?: Response;
}

export interface StreamFailureDispatchPayload {
  ctx: StreamFailureContext;
  error: unknown;
  options: StreamFailureDispatchOptions;
  sanitized: SanitizedStreamError;
}
