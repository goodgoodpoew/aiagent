/**
 * 流式失败 Sink 扩展点
 *
 * 新增同步副作用：
 * 1. 实现 StreamFailureSink
 * 2. 在 AiProxyModule 的 STREAM_FAILURE_SINK useFactory 中注入并追加你的 Sink
 *
 * 新增异步、可重试副作用：监听 CHAT_EVENTS.STREAM_ERROR，勿阻塞 Sink 链
 */
import type { StreamFailureDispatchPayload } from './stream-failure.types';

export const STREAM_FAILURE_SINK = Symbol('STREAM_FAILURE_SINK');

export interface StreamFailureSink {
  readonly name: string;
  supports?(payload: StreamFailureDispatchPayload): boolean;
  handle(payload: StreamFailureDispatchPayload): Promise<void> | void;
}
