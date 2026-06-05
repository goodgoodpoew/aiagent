import { Injectable } from '@nestjs/common';
import { MESSAGE_PROTOCOL_V2 } from '@/message/dto/create-message.dto';
import type {
  MessagePart,
  FileReadMessagePart,
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

export interface CompletedFileReadPartInput {
  fileId: string;
  name: string;
  mimeType?: string;
  tokenEstimate?: number;
  status: Extract<FileReadMessagePart['status'], 'done' | 'failed'>;
  reason?: string;
}

@Injectable()
export class StreamMessageBuilderService {
  // builder 只负责把后端内部状态转换为前端协议里的 message snapshot / message part payload。
  // 它不写 SSE、不访问数据库，保证同一个 part id 在 started/delta/completed 三个阶段保持一致。
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

  startFileReadPart(
    state: StreamMessageBuilderState,
    input: Pick<CompletedFileReadPartInput, 'fileId' | 'name' | 'mimeType'>,
  ): MessagePartStartedData {
    return {
      part: {
        id: this.fileReadPartId(state.assistantMessageId, input.fileId),
        type: 'file_read',
        fileId: input.fileId,
        name: input.name,
        ...(input.mimeType ? { mimeType: input.mimeType } : {}),
        status: 'streaming',
      },
    };
  }

  completeFileReadPart(
    state: StreamMessageBuilderState,
    input: CompletedFileReadPartInput,
  ): MessagePartCompletedData {
    return {
      partId: this.fileReadPartId(state.assistantMessageId, input.fileId),
      type: 'file_read',
      status: input.status,
      fileId: input.fileId,
      name: input.name,
      ...(input.mimeType ? { mimeType: input.mimeType } : {}),
      ...(input.tokenEstimate !== undefined ? { tokenEstimate: input.tokenEstimate } : {}),
      ...(input.reason ? { reason: input.reason } : {}),
    };
  }

  buildCompletedAssistantMessage(
    state: StreamMessageBuilderState,
    params: {
      content: string;
      fileReads?: CompletedFileReadPartInput[];
      reasoning?: CompletedReasoningPartInput;
      toolCalls?: CompletedToolCallPartInput[];
      toolResults?: CompletedToolResultPartInput[];
    },
  ): StreamMessageSnapshot {
    // 完整快照用于 message.completed 和最终持久化：
    // 前面流式阶段已经逐步发过 part 事件，这里重新组装一次权威版本，方便前端覆盖本地累积结果。
    const parts: MessagePart[] = [];
    params.fileReads?.forEach((fileRead) => {
      parts.push(this.buildFileReadPart(state, fileRead));
    });
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
    // text part 放在最后，展示时仍由前端按 parts 顺序渲染；辅助过程先出现，最终回答收尾。
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

  private fileReadPartId(messageId: string, fileId: string): string {
    return `${messageId}:file-read:${fileId}`;
  }

  private buildFileReadPart(
    state: StreamMessageBuilderState,
    input: CompletedFileReadPartInput,
  ): FileReadMessagePart {
    return {
      id: this.fileReadPartId(state.assistantMessageId, input.fileId),
      type: 'file_read',
      fileId: input.fileId,
      name: input.name,
      ...(input.mimeType ? { mimeType: input.mimeType } : {}),
      ...(input.tokenEstimate !== undefined ? { tokenEstimate: input.tokenEstimate } : {}),
      status: input.status,
      ...(input.reason ? { reason: input.reason } : {}),
    };
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
