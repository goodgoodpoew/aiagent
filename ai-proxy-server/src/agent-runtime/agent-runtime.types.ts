import type { Response } from 'express';
import type { ChatRequestDto, ChatMessage } from '@/ai-proxy/dto/chat.dto';
import type { PreparedSendMessage } from '@/conversation/conversation-application.service';
import type { CompletedFileReadPartInput, CompletedReasoningPartInput, CompletedToolCallPartInput, CompletedToolResultPartInput } from '@/streaming/services/stream-message-builder.service';
import type { StreamEventScope, StreamEventType, StreamFailureStage } from '@/streaming/protocol/stream-event.types';
import type { ChatStreamRequestV2 } from '@/streaming/dto/chat-stream-v2.dto';
import type { ToolDefinition } from '@/tools/dto/tool-definition.dto';

export interface AgentRuntimeInput {
  dto: ChatStreamRequestV2;
  userId: string;
  requestId: string;
  traceId: string;
}

export interface AgentRunContext {
  requestId: string;
  traceId: string;
  userId: string;
  sessionId?: string;
  assistantMessageId?: string;
  userMessageId?: string;
  provider?: string;
  platform?: string;
  model?: string;
  credentialId?: string;
  runtime?: ChatStreamRequestV2['runtime'];
  audit?: {
    engine: 'native' | 'langgraph' | 'openai-agents';
    startedAt: string;
  };
}

export interface PendingAgentToolCall {
  index: number;
  toolCallId?: string;
  toolName?: string;
  source?: ToolDefinition['source'];
  argumentsText: string;
  started: boolean;
}

export interface AgentRunState {
  failureStage: StreamFailureStage;
  effectiveUserId: string;
  autoGenerateSessionName: boolean;
  textProjection: string;
  fileIds: string[];
  prepared?: PreparedSendMessage;
  providerRequest?: ChatRequestDto;
  promptMessagesForUsage: ChatMessage[];
  completedFileReads: CompletedFileReadPartInput[];
  finalContent: string;
  finalReasoningText: string;
  finalReasoningSummary: string;
  encryptedReasoningContent: string;
  textPartStarted: boolean;
  reasoningPartStarted: boolean;
  finishReason?: string;
  reasoningEnabled: boolean;
  reasoningVisibility: CompletedReasoningPartInput['visibility'];
  pendingToolCalls: Map<number, PendingAgentToolCall>;
  completedToolCalls: CompletedToolCallPartInput[];
  completedToolResults: CompletedToolResultPartInput[];
  stopped: boolean;
}

export interface AgentRuntimeSseEvent {
  kind: 'sse';
  type: StreamEventType;
  data: unknown;
  scope?: StreamEventScope;
}

export interface AgentRuntimeHeaderEvent {
  kind: 'header';
  name: string;
  value: string;
}

export interface AgentRuntimeEndEvent {
  kind: 'end';
}

export type AgentRuntimeEvent =
  | AgentRuntimeSseEvent
  | AgentRuntimeHeaderEvent
  | AgentRuntimeEndEvent;

export type AgentRuntimeEmit = (event: AgentRuntimeEvent) => void;

export interface AgentStep {
  name: string;
  stage: StreamFailureStage;
  nodeId?: string;
  dependsOn?: string[];
  resumable?: boolean;
  visibility?: 'hidden' | 'status' | 'summary' | 'detail';
  execute(
    ctx: AgentRunContext,
    state: AgentRunState,
    emit: AgentRuntimeEmit,
  ): Promise<void> | void;
}

export interface AgentRuntimeProjectorTarget {
  res: Response;
  requestId: string;
  traceId: string;
}
