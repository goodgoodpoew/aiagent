import type { BubbleListProps } from '@ant-design/x';

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
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt?: string;
}

export type MessageRuntimeStatus = 'sending' | 'streaming' | 'done' | 'error';

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
  /** 待发送的附件列表 */
  attachments: ChatAttachment[];
}

export interface SendChatPayload {
  query: string;
  sessionId?: string;
  requestId?: string;
  clientMessageId?: string;
  autoGenerateSessionName?: boolean;
  provider?: string;
  model?: string;
  credentialId?: string;
  temperature?: number;
  max_tokens?: number;
  stream: boolean;
  /** 已上传完成的文件 ID 列表 */
  fileIds?: string[];
}

export interface ChatStreamChunk {
  status?: string;
  errorCode?: string;
  sessionId?: string;
  messageId?: string;
  delta?: string;
  role?: string;
  choices: Array<{
    message: {
      content: string;
      role: string;
    };
    sessionId?: string;
  }>;
}

export type ChatBubbleItem = NonNullable<BubbleListProps['items']>[number];
