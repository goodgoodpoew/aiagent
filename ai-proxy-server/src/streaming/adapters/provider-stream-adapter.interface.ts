import type { IncomingMessage } from 'http';

export type ProviderStreamEvent =
  | {
      type: 'text.delta';
      delta: string;
    }
  | {
      type: 'reasoning.delta';
      delta: string;
      field: 'text' | 'summary' | 'encryptedContent';
    }
  | {
      type: 'tool.call.delta';
      index: number;
      toolCallId?: string;
      toolName?: string;
      argumentsDelta?: string;
    }
  | {
      type: 'done';
      finishReason?: string;
    };

export interface ProviderStreamAdapter {
  /**
   * provider adapter 只负责把上游私有协议归一化，不处理会话、消息和前端 SSE。
   */
  read(upstream: IncomingMessage): AsyncIterable<ProviderStreamEvent>;
}
