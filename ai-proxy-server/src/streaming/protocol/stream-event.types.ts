import type {
  MessagePart,
  ProcessTraceMessagePart,
  ProcessTraceStatus,
  ToolCallMessagePart,
  ToolResultMessagePart,
} from './message-part.types';

export const STREAM_PROTOCOL_V2 = 'aiagent.stream.v2' as const;

export type StreamProtocolV2 = typeof STREAM_PROTOCOL_V2;

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
    source?: 'estimated' | 'provider';
    strategy?: string;
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
  usage?: UsageUpdatedData['usage'];
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
