import { Injectable } from '@nestjs/common';
import { MESSAGE_PROTOCOL_V2 } from '@/message/dto/create-message.dto';
import type {
  MessagePart,
  ReasoningMessagePart,
  TextMessagePart,
  ToolCallMessagePart,
  ToolResultMessagePart,
} from '../protocol/message-part.types';
import type {
  MessagePartCompletedData,
  MessagePartDeltaData,
  MessagePartStartedData,
  StreamMessageSnapshot,
} from '../protocol/stream-event.types';

export interface StreamMessageBuilderState {
  sessionId: string;
  assistantMessageId: string;
}

export interface CompletedReasoningPartInput {
  visibility: ReasoningMessagePart['visibility'];
  text?: string;
  summary?: string;
  encryptedContent?: string;
}

export interface CompletedToolCallPartInput {
  toolCallId: string;
  toolName: string;
  source: ToolCallMessagePart['source'];
  argumentsText: string;
  arguments?: Record<string, unknown>;
  status: ToolCallMessagePart['status'];
}

export interface CompletedToolResultPartInput {
  toolCallId: string;
  toolName: string;
  result?: unknown;
  error?: ToolResultMessagePart['error'];
  status: ToolResultMessagePart['status'];
}

@Injectable()
export class StreamMessageBuilderService {
  createAssistantSnapshot(state: StreamMessageBuilderState): StreamMessageSnapshot {
    return {
      id: state.assistantMessageId,
      role: 'assistant',
      content: '',
      parts: [],
      status: 'streaming',
      metadata: {
        protocol: MESSAGE_PROTOCOL_V2,
      },
    };
  }

  createUserSnapshot(params: {
    userMessageId: string;
    content: string;
    parts: MessagePart[];
  }): StreamMessageSnapshot {
    return {
      id: params.userMessageId,
      role: 'user',
      content: params.content,
      parts: params.parts,
      status: 'done',
    };
  }

  startTextPart(state: StreamMessageBuilderState): MessagePartStartedData {
    return {
      part: {
        id: this.textPartId(state.assistantMessageId),
        type: 'text',
        text: '',
        status: 'streaming',
      },
    };
  }

  appendTextDelta(
    state: StreamMessageBuilderState,
    delta: string,
  ): MessagePartDeltaData {
    return {
      partId: this.textPartId(state.assistantMessageId),
      type: 'text',
      delta,
    };
  }

  completeTextPart(
    state: StreamMessageBuilderState,
    text: string,
  ): MessagePartCompletedData {
    return {
      partId: this.textPartId(state.assistantMessageId),
      type: 'text',
      status: 'done',
      text,
    };
  }

  startReasoningPart(
    state: StreamMessageBuilderState,
    visibility: ReasoningMessagePart['visibility'],
  ): MessagePartStartedData {
    return {
      part: {
        id: this.reasoningPartId(state.assistantMessageId),
        type: 'reasoning',
        visibility,
        status: 'streaming',
      },
    };
  }

  appendReasoningDelta(
    state: StreamMessageBuilderState,
    delta: string,
    field: 'text' | 'summary' | 'encryptedContent',
  ): MessagePartDeltaData {
    return {
      partId: this.reasoningPartId(state.assistantMessageId),
      type: 'reasoning',
      delta,
      field,
    };
  }

  completeReasoningPart(
    state: StreamMessageBuilderState,
    reasoning: CompletedReasoningPartInput,
  ): MessagePartCompletedData {
    return {
      partId: this.reasoningPartId(state.assistantMessageId),
      type: 'reasoning',
      status: 'done',
      ...(reasoning.visibility === 'full' && reasoning.text ? { text: reasoning.text } : {}),
      ...((reasoning.visibility === 'summary' || reasoning.visibility === 'full') && reasoning.summary
        ? { summary: reasoning.summary }
        : {}),
      ...(reasoning.encryptedContent ? { encryptedContent: reasoning.encryptedContent } : {}),
    };
  }

  startToolCallPart(
    state: StreamMessageBuilderState,
    input: Pick<CompletedToolCallPartInput, 'toolCallId' | 'toolName' | 'source'>,
  ): MessagePartStartedData {
    return {
      part: {
        id: this.toolCallPartId(state.assistantMessageId, input.toolCallId),
        type: 'tool_call',
        toolCallId: input.toolCallId,
        toolName: input.toolName,
        source: input.source,
        argumentsText: '',
        status: 'partial',
      },
    };
  }

  appendToolCallArgumentsDelta(
    state: StreamMessageBuilderState,
    toolCallId: string,
    delta: string,
  ): MessagePartDeltaData {
    return {
      partId: this.toolCallPartId(state.assistantMessageId, toolCallId),
      type: 'tool_call',
      delta,
      field: 'argumentsText',
    };
  }

  completeToolCallPart(
    state: StreamMessageBuilderState,
    input: CompletedToolCallPartInput,
  ): MessagePartCompletedData {
    return {
      partId: this.toolCallPartId(state.assistantMessageId, input.toolCallId),
      type: 'tool_call',
      status: input.status === 'failed' ? 'failed' : 'done',
      argumentsText: input.argumentsText,
      ...(input.arguments ? { arguments: input.arguments } : {}),
      toolStatus: input.status,
    };
  }

  startToolResultPart(
    state: StreamMessageBuilderState,
    input: Pick<CompletedToolResultPartInput, 'toolCallId' | 'toolName'>,
  ): MessagePartStartedData {
    return {
      part: {
        id: this.toolResultPartId(state.assistantMessageId, input.toolCallId),
        type: 'tool_result',
        toolCallId: input.toolCallId,
        toolName: input.toolName,
        status: 'streaming',
      },
    };
  }

  completeToolResultPart(
    state: StreamMessageBuilderState,
    input: CompletedToolResultPartInput,
  ): MessagePartCompletedData {
    return {
      partId: this.toolResultPartId(state.assistantMessageId, input.toolCallId),
      type: 'tool_result',
      status: input.status === 'failed' ? 'failed' : 'done',
      ...(input.result !== undefined ? { result: input.result } : {}),
      ...(input.error ? { error: input.error } : {}),
    };
  }

  buildCompletedAssistantMessage(
    state: StreamMessageBuilderState,
    params: {
      content: string;
      reasoning?: CompletedReasoningPartInput;
      toolCalls?: CompletedToolCallPartInput[];
      toolResults?: CompletedToolResultPartInput[];
    },
  ): StreamMessageSnapshot {
    const parts: MessagePart[] = [];
    const reasoningPart = params.reasoning ? this.buildReasoningPart(state, params.reasoning) : undefined;
    if (reasoningPart) {
      parts.push(reasoningPart);
    }
    params.toolCalls?.forEach((toolCall) => {
      parts.push(this.buildToolCallPart(state, toolCall));
    });
    params.toolResults?.forEach((toolResult) => {
      parts.push(this.buildToolResultPart(state, toolResult));
    });

    const textPart: TextMessagePart = {
      id: this.textPartId(state.assistantMessageId),
      type: 'text',
      text: params.content,
      status: 'done',
    };
    parts.push(textPart);

    return {
      id: state.assistantMessageId,
      role: 'assistant',
      content: params.content,
      parts,
      status: 'done',
      metadata: {
        protocol: MESSAGE_PROTOCOL_V2,
      },
      updatedAt: new Date().toISOString(),
    };
  }

  private textPartId(messageId: string): string {
    return `${messageId}:text:0`;
  }

  private reasoningPartId(messageId: string): string {
    return `${messageId}:reasoning:0`;
  }

  private toolCallPartId(messageId: string, toolCallId: string): string {
    return `${messageId}:tool-call:${toolCallId}`;
  }

  private toolResultPartId(messageId: string, toolCallId: string): string {
    return `${messageId}:tool-result:${toolCallId}`;
  }

  private buildReasoningPart(
    state: StreamMessageBuilderState,
    reasoning: CompletedReasoningPartInput,
  ): ReasoningMessagePart | undefined {
    const part: ReasoningMessagePart = {
      id: this.reasoningPartId(state.assistantMessageId),
      type: 'reasoning',
      visibility: reasoning.visibility,
      status: 'done',
    };

    // 安全策略：只有显式 full 才保存原始思考文本；summary 只保存供应商明确给出的摘要。
    if (reasoning.visibility === 'full' && reasoning.text) {
      part.text = reasoning.text;
    }
    if ((reasoning.visibility === 'summary' || reasoning.visibility === 'full') && reasoning.summary) {
      part.summary = reasoning.summary;
    }
    if (reasoning.encryptedContent) {
      part.encryptedContent = reasoning.encryptedContent;
    }

    return part;
  }

  private buildToolCallPart(
    state: StreamMessageBuilderState,
    input: CompletedToolCallPartInput,
  ): ToolCallMessagePart {
    return {
      id: this.toolCallPartId(state.assistantMessageId, input.toolCallId),
      type: 'tool_call',
      toolCallId: input.toolCallId,
      toolName: input.toolName,
      source: input.source,
      argumentsText: input.argumentsText,
      ...(input.arguments ? { arguments: input.arguments } : {}),
      status: input.status,
    };
  }

  private buildToolResultPart(
    state: StreamMessageBuilderState,
    input: CompletedToolResultPartInput,
  ): ToolResultMessagePart {
    return {
      id: this.toolResultPartId(state.assistantMessageId, input.toolCallId),
      type: 'tool_result',
      toolCallId: input.toolCallId,
      toolName: input.toolName,
      ...(input.result !== undefined ? { result: input.result } : {}),
      ...(input.error ? { error: input.error } : {}),
      status: input.status,
    };
  }
}
