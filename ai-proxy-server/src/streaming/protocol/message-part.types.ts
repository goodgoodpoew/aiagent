export type MessagePartStatus = 'streaming' | 'done' | 'failed';

export type MessagePart =
  | TextMessagePart
  | ReasoningMessagePart
  | ToolCallMessagePart
  | ToolResultMessagePart
  | FileReadMessagePart
  | FileMessagePart
  | ReferenceMessagePart
  | ProcessTraceMessagePart
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

export type ProcessTraceStatus =
  | 'pending'
  | 'running'
  | 'done'
  | 'failed'
  | 'skipped'
  | 'cancelled';

export type ProcessTraceType =
  | 'thinking'
  | 'context'
  | 'file_read'
  | 'knowledge_retrieval'
  | 'mcp_resource'
  | 'mcp_tool'
  | 'builtin_tool'
  | 'custom_tool'
  | 'citation'
  | 'system';

export interface ProcessTraceMessagePart {
  id: string;
  type: 'process_trace';
  traceType: ProcessTraceType;
  title: string;
  status: ProcessTraceStatus;
  visibility: 'hidden' | 'status' | 'summary' | 'detail';
  summary?: string;
  detail?: Record<string, unknown>;
  refs?: Array<{
    type: 'file' | 'mcp' | 'knowledge' | 'web' | 'session' | 'tool';
    id?: string;
    title?: string;
    uri?: string;
  }>;
  metrics?: {
    startedAt?: string;
    completedAt?: string;
    durationMs?: number;
    tokenEstimate?: number;
    inputBytes?: number;
    outputBytes?: number;
  };
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

export interface ErrorMessagePart {
  id: string;
  type: 'error';
  code: string;
  message: string;
  retryable: boolean;
  stage?: string;
}
