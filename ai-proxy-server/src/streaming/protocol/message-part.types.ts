export type MessagePartStatus = 'streaming' | 'done' | 'failed';

export type MessagePart =
  | TextMessagePart
  | ReasoningMessagePart
  | ToolCallMessagePart
  | ToolResultMessagePart
  | FileReadMessagePart
  | FileMessagePart
  | ReferenceMessagePart
  | ErrorMessagePart;

export interface TextMessagePart {
  id: string;
  type: 'text';
  text: string;
  status: Extract<MessagePartStatus, 'streaming' | 'done'>;
}

export interface ReasoningMessagePart {
  id: string;
  type: 'reasoning';
  text?: string;
  summary?: string;
  encryptedContent?: string;
  visibility: 'hidden' | 'summary' | 'full';
  status: Extract<MessagePartStatus, 'streaming' | 'done'>;
}

export interface ToolCallMessagePart {
  id: string;
  type: 'tool_call';
  toolCallId: string;
  toolName: string;
  source: 'builtin' | 'custom' | 'mcp';
  argumentsText?: string;
  arguments?: Record<string, unknown>;
  status: 'partial' | 'ready' | 'running' | 'done' | 'failed';
}

export interface ToolResultMessagePart {
  id: string;
  type: 'tool_result';
  toolCallId: string;
  toolName: string;
  result?: unknown;
  error?: {
    code: string;
    message: string;
  };
  status: MessagePartStatus;
}

export interface FileReadMessagePart {
  id: string;
  type: 'file_read';
  fileId: string;
  name: string;
  mimeType?: string;
  tokenEstimate?: number;
  status: MessagePartStatus;
  reason?: string;
}

export interface FileMessagePart {
  id: string;
  type: 'file';
  fileId: string;
  name: string;
  mimeType?: string;
  size?: number;
}

export interface ReferenceMessagePart {
  id: string;
  type: 'reference';
  title: string;
  uri?: string;
  fileId?: string;
  quote?: string;
  source?: 'file' | 'mcp' | 'web' | 'session';
}

export interface ErrorMessagePart {
  id: string;
  type: 'error';
  code: string;
  message: string;
  retryable: boolean;
  stage?: string;
}
