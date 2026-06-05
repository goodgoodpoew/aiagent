export const STREAM_PROTOCOL_V2 = 'aiagent.stream.v2' as const;

export type StreamProtocolV2 = typeof STREAM_PROTOCOL_V2;

export interface ChatStreamRequestV2 {
  protocol: StreamProtocolV2;
  requestId: string;
  clientMessageId: string;
  sessionId?: string;
  input: UserMessageInput;
  context?: ChatContextInput;
  runtime?: ChatRuntimeOptions;
  response?: ChatResponseOptions;
}

export interface UserMessageInput {
  role: 'user';
  parts: UserMessagePart[];
}

export type UserMessagePart =
  | TextInputPart
  | FileInputPart
  | ImageInputPart
  | ResourceReferencePart
  | CommandInputPart;

export interface TextInputPart {
  type: 'text';
  text: string;
}

export interface FileInputPart {
  type: 'file';
  fileId: string;
  name?: string;
  mimeType?: string;
}

export interface ImageInputPart {
  type: 'image';
  fileId: string;
  mimeType?: string;
  detail?: 'low' | 'high' | 'auto';
}

export interface ResourceReferencePart {
  type: 'resource';
  uri: string;
  title?: string;
  source?: 'mcp' | 'local' | 'web' | 'session';
}

export interface CommandInputPart {
  type: 'command';
  name: string;
  args?: Record<string, unknown>;
}

export interface ChatContextInput {
  includeHistory?: boolean;
  historyLimit?: number;
  fileIds?: string[];
  resources?: Array<{
    uri: string;
    type?: string;
    source?: 'mcp' | 'local' | 'web' | 'session';
  }>;
}

export interface ChatRuntimeOptions {
  provider?: string;
  model?: string;
  credentialId?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: true;
  tools?: ToolDefinitionRef[];
  toolChoice?: 'auto' | 'none' | { type: 'tool'; name: string };
  reasoning?: {
    enabled?: boolean;
    effort?: 'low' | 'medium' | 'high';
    display?: 'none' | 'summary' | 'full';
  };
  autoGenerateSessionName?: boolean;
}

export interface ToolDefinitionRef {
  source: 'builtin' | 'custom' | 'mcp';
  name: string;
  serverId?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface ChatResponseOptions {
  modalities?: Array<'text' | 'image' | 'file' | 'json'>;
  format?: 'text' | 'json_object' | { type: 'json_schema'; schema: Record<string, unknown> };
}

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

export type StreamEventType =
  | 'stream.started'
  | 'session.created'
  | 'message.created'
  | 'message.part.started'
  | 'message.part.delta'
  | 'message.part.completed'
  | 'message.completed'
  | 'tool.call.started'
  | 'tool.call.delta'
  | 'tool.call.completed'
  | 'tool.result.started'
  | 'tool.result.completed'
  | 'reasoning.started'
  | 'reasoning.delta'
  | 'reasoning.completed'
  | 'process.trace.started'
  | 'process.trace.delta'
  | 'process.trace.completed'
  | 'process.trace.failed'
  | 'process.trace.skipped'
  | 'usage.updated'
  | 'stream.completed'
  | 'stream.failed';

export interface StreamEventEnvelope<T = unknown> {
  protocol: StreamProtocolV2;
  id: string;
  type: StreamEventType;
  traceId: string;
  requestId: string;
  sessionId?: string;
  messageId?: string;
  timestamp: string;
  sequence: number;
  data: T;
}

export interface StreamEventScope {
  sessionId?: string;
  messageId?: string;
}

export interface StreamStartedData {
  provider?: string;
  model?: string;
  createdAt: string;
}

export interface SessionCreatedData {
  session: {
    id: string;
    title?: string | null;
    titleStatus?: string;
    version?: number;
    createdAt: string;
    updatedAt: string;
  };
}

export interface StreamMessageSnapshot {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  parts: MessagePart[];
  status: 'pending' | 'sending' | 'streaming' | 'done' | 'failed' | 'cancelled';
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface MessageCreatedData {
  userMessage: StreamMessageSnapshot;
  assistantMessage: StreamMessageSnapshot;
  clientMessageId: string;
}

export interface MessagePartStartedData {
  part: MessagePart;
}

export interface MessagePartDeltaData {
  partId: string;
  type: MessagePart['type'];
  delta: string;
  field?: 'text' | 'summary' | 'encryptedContent' | 'argumentsText';
}

export interface MessagePartCompletedData {
  partId: string;
  type: MessagePart['type'];
  status: 'done' | 'failed' | 'skipped' | 'cancelled';
  fileId?: string;
  name?: string;
  mimeType?: string;
  tokenEstimate?: number;
  reason?: string;
  text?: string;
  summary?: string;
  encryptedContent?: string;
  arguments?: Record<string, unknown>;
  argumentsText?: string;
  toolStatus?: ToolCallMessagePart['status'];
  result?: unknown;
  error?: ToolResultMessagePart['error'];
  traceStatus?: ProcessTraceStatus;
  traceType?: ProcessTraceMessagePart['traceType'];
  title?: string;
  visibility?: ProcessTraceMessagePart['visibility'];
  detail?: ProcessTraceMessagePart['detail'];
  refs?: ProcessTraceMessagePart['refs'];
  metrics?: ProcessTraceMessagePart['metrics'];
  processError?: ProcessTraceMessagePart['error'];
}

export interface ToolCallStartedData {
  toolCallId: string;
  toolName: string;
  source: ToolCallMessagePart['source'];
}

export interface ToolCallDeltaData {
  toolCallId: string;
  toolName: string;
  argumentsDelta: string;
}

export interface ToolCallCompletedData {
  toolCallId: string;
  toolName: string;
  argumentsText: string;
  arguments?: Record<string, unknown>;
}

export interface ToolResultStartedData {
  toolCallId: string;
  toolName: string;
}

export interface ToolResultCompletedData {
  toolCallId: string;
  toolName: string;
  result?: unknown;
  error?: ToolResultMessagePart['error'];
}

export interface MessageCompletedData {
  message: StreamMessageSnapshot;
}

export interface UsageUpdatedData {
  usage: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface ProcessTraceStartedData {
  part: ProcessTraceMessagePart;
}

export interface ProcessTraceDeltaData {
  partId: string;
  summaryDelta?: string;
  detailPatch?: Record<string, unknown>;
  status?: ProcessTraceStatus;
  metricsPatch?: ProcessTraceMessagePart['metrics'];
}

export interface ProcessTraceCompletedData {
  partId: string;
  status: Extract<ProcessTraceStatus, 'done' | 'failed' | 'skipped' | 'cancelled'>;
  summary?: string;
  detail?: ProcessTraceMessagePart['detail'];
  refs?: ProcessTraceMessagePart['refs'];
  metrics?: ProcessTraceMessagePart['metrics'];
  error?: ProcessTraceMessagePart['error'];
}

export interface StreamCompletedData {
  finishReason?: string;
}

export type StreamFailureStage =
  | 'prepare'
  | 'provider_connect'
  | 'provider_stream'
  | 'tool_execution'
  | 'persistence'
  | 'unknown';

export interface StreamFailedData {
  code: string;
  message: string;
  retryable: boolean;
  stage: StreamFailureStage;
}
