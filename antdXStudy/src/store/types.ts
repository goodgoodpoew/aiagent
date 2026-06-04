import type { BubbleListProps } from '@ant-design/x';
import type { MessagePart, ChatRuntimeOptions } from '@/service/stream-protocol';

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatSession {
  id: string;
  userId?: string;
  title?: string | null;
  titleStatus?: string;
  version?: number;
  isDeleted?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: ChatRole;
  content: string;
  /** content 是兼容文本投影；parts 为 v2 结构化消息预留，当前不影响现有 Bubble 渲染。 */
  parts?: MessagePart[];
  /** 刷新历史消息时从 metadata.status 投影而来，便于恢复失败/流式占位展示。 */
  status?: MessageRuntimeStatus;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt?: string;
}

export type MessageRuntimeStatus = 'sending' | 'streaming' | 'done' | 'failed';

/** 聊天附件状态 */
export interface ChatAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  status: 'uploading' | 'ready' | 'failed';
}

export interface ChatFile {
  id: string;
  name: string;
  type: string;
  extension?: string;
  size: number;
  status: string;
  purpose: string;
  url?: string;
  createdAt: string;
  updatedAt: string;
  sessionCount: number;
  messageCount: number;
}

export interface ChatDraft {
  input: string;
  provider?: string;
  model?: string;
  credentialId?: string;
  temperature?: number;
  max_tokens?: number;
  stream: boolean;
  /** 默认只展示思考状态/摘要；完整 reasoning 需要显式改为 full。 */
  reasoning?: ChatRuntimeOptions['reasoning'];
  /** 待发送的附件列表 */
  attachments: ChatAttachment[];
}

export type ChatBubbleItem = NonNullable<BubbleListProps['items']>[number];
