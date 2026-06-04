import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import * as crypto from 'crypto';
import { AiProxyService } from '@/ai-proxy/ai-proxy.service';
import { ChatRequestDto } from '@/ai-proxy/dto/chat.dto';
import { sanitizeStreamError, StreamErrorCode } from '@/ai-proxy/errors/stream-error.util';
import { ConversationApplicationService } from '@/conversation/conversation-application.service';
import { MessageService } from '@/message/message.service';
import { ModelProviderRegistryService } from '@/model-provider/model-provider-registry.service';
import { ToolExecutorService } from '@/tools/tool-executor.service';
import { ToolRegistryService } from '@/tools/tool-registry.service';
import type { ToolDefinition } from '@/tools/dto/tool-definition.dto';
import type { ChatStreamRequestV2, UserMessagePart } from '../dto/chat-stream-v2.dto';
import {
  STREAM_EVENT_WRITER_FACTORY,
  type StreamEventWriterFactory,
} from '../streaming.module';
import { OpenAiCompatibleStreamAdapter } from '../adapters/openai-compatible-stream.adapter';
import {
  StreamMessageBuilderService,
  type CompletedReasoningPartInput,
  type CompletedToolCallPartInput,
  type CompletedToolResultPartInput,
} from './stream-message-builder.service';
import type { StreamFailureStage } from '../protocol/stream-event.types';
import type { ReasoningMessagePart } from '../protocol/message-part.types';

interface PendingToolCall {
  index: number;
  toolCallId?: string;
  toolName?: string;
  source?: ToolDefinition['source'];
  argumentsText: string;
  started: boolean;
}

@Injectable()
export class StreamOrchestratorService {
  private readonly logger = new Logger(StreamOrchestratorService.name);

  constructor(
    private readonly aiProxyService: AiProxyService,
    private readonly conversation: ConversationApplicationService,
    private readonly messageService: MessageService,
    private readonly modelProviderRegistry: ModelProviderRegistryService,
    private readonly providerAdapter: OpenAiCompatibleStreamAdapter,
    private readonly messageBuilder: StreamMessageBuilderService,
    private readonly toolRegistry: ToolRegistryService,
    private readonly toolExecutor: ToolExecutorService,
    @Inject(STREAM_EVENT_WRITER_FACTORY)
    private readonly createWriter: StreamEventWriterFactory,
  ) {}

  async streamChat(dto: ChatStreamRequestV2, userId: string, res: Response): Promise<void> {
    this.prepareSseResponse(res);

    const requestId = dto.requestId || crypto.randomUUID();
    const traceId = crypto.randomUUID();
    const writer = this.createWriter(res, { requestId, traceId });
    const effectiveUserId = userId || 'anonymous';
    const autoGenerateSessionName = dto.runtime?.autoGenerateSessionName ?? true;
    let failureContext:
      | { sessionId: string; assistantMessageId: string; platform: string; model: string }
      | undefined;
    let failureStage: StreamFailureStage = 'prepare';

    try {
      const textProjection = this.extractTextProjection(dto.input.parts);
      const fileIds = this.extractFileIds(dto);
      const platform = await this.modelProviderRegistry.resolveProvider(
        dto.runtime?.provider,
      );
      const model = await this.modelProviderRegistry.resolveModel(
        platform,
        dto.runtime?.model,
        'llm',
      );
      const requestedTools = this.toolRegistry.resolveRequestedTools(dto.runtime?.tools ?? []);
      const requestedToolChoice = dto.runtime?.toolChoice;
      if (
        requestedToolChoice
        && typeof requestedToolChoice === 'object'
        && !requestedTools.some((tool) => tool.name === requestedToolChoice.name)
      ) {
        throw new BadRequestException(`toolChoice 指定了未启用工具：${requestedToolChoice.name}`);
      }

      const prepared = await this.conversation.prepareSendMessage({
        userId: effectiveUserId,
        query: textProjection,
        sessionId: dto.sessionId,
        requestId,
        clientMessageId: dto.clientMessageId,
        inputParts: dto.input.parts,
        fileIds,
        autoGenerateSessionName,
        platform,
        provider: platform,
        model,
        credentialId: dto.runtime?.credentialId,
      });

      res.setHeader('X-Session-Id', prepared.sessionId);
      failureContext = {
        sessionId: prepared.sessionId,
        assistantMessageId: prepared.assistantMessageId,
        platform,
        model,
      };
      this.logger.log(`v2 流开始: session=${prepared.sessionId}, request=${requestId}`);

      writer.write(
        'stream.started',
        {
          provider: platform,
          model,
          createdAt: new Date().toISOString(),
        },
        { sessionId: prepared.sessionId },
      );

      if (prepared.isNewSession && prepared.session) {
        writer.write(
          'session.created',
          {
            session: {
              id: prepared.sessionId,
              title: prepared.session.title,
              titleStatus: prepared.session.titleStatus,
              version: prepared.session.version,
              createdAt: prepared.session.createdAt,
              updatedAt: prepared.session.updatedAt,
            },
          },
          { sessionId: prepared.sessionId },
        );
      }

      const userParts = prepared.userMessageParts ?? [];
      const assistantState = {
        sessionId: prepared.sessionId,
        assistantMessageId: prepared.assistantMessageId,
      };

      writer.write(
        'message.created',
        {
          userMessage: this.messageBuilder.createUserSnapshot({
            userMessageId: prepared.userMessageId,
            content: textProjection,
            parts: userParts,
          }),
          assistantMessage: this.messageBuilder.createAssistantSnapshot(assistantState),
          clientMessageId: prepared.clientMessageId ?? dto.clientMessageId,
        },
        {
          sessionId: prepared.sessionId,
          messageId: prepared.assistantMessageId,
        },
      );

      if (prepared.isReplay) {
        writer.write(
          'stream.failed',
          {
            code: 'REQUEST_ALREADY_IN_PROGRESS',
            message: '同一请求正在处理或已完成，请刷新会话消息确认结果',
            retryable: prepared.requestStatus !== 'failed',
            stage: 'prepare',
          },
          {
            sessionId: prepared.sessionId,
            messageId: prepared.assistantMessageId,
          },
        );
        this.endResponse(res);
        return;
      }

      const requestDto = new ChatRequestDto();
      requestDto.platform = platform;
      requestDto.provider = platform;
      requestDto.model = model;
      requestDto.credentialId = dto.runtime?.credentialId;
      requestDto.stream = true;
      requestDto.messages = prepared.llmMessages;
      requestDto.temperature = dto.runtime?.temperature;
      requestDto.max_tokens = dto.runtime?.maxTokens;
      requestDto.fileIds = fileIds;
      requestDto.reasoning = dto.runtime?.reasoning;
      requestDto.tools = requestedTools;
      requestDto.toolChoice = dto.runtime?.toolChoice;

      failureStage = 'provider_connect';
      const upstream = await this.aiProxyService.proxyChatStream(requestDto);
      let finalContent = '';
      let finalReasoningText = '';
      let finalReasoningSummary = '';
      let encryptedReasoningContent = '';
      let textPartStarted = false;
      let reasoningPartStarted = false;
      let finishReason: string | undefined;
      const reasoningEnabled = dto.runtime?.reasoning?.enabled !== false;
      const reasoningVisibility = this.resolveReasoningVisibility(dto.runtime?.reasoning?.display);
      const streamScope = {
        sessionId: prepared.sessionId,
        messageId: prepared.assistantMessageId,
      };
      const pendingToolCalls = new Map<number, PendingToolCall>();
      const completedToolCalls: CompletedToolCallPartInput[] = [];
      const completedToolResults: CompletedToolResultPartInput[] = [];
      const handleProviderEvent = (event): void => {
        if (event.type === 'reasoning.delta') {
          if (!reasoningEnabled) return;

          if (!reasoningPartStarted) {
            reasoningPartStarted = true;
            writer.write(
              'message.part.started',
              this.messageBuilder.startReasoningPart(assistantState, reasoningVisibility),
              streamScope,
            );
          }

          if (event.field === 'text') {
            // 原始 reasoning_content 只在用户显式选择 full 时进入前端和持久化。
            if (reasoningVisibility === 'full') {
              finalReasoningText += event.delta;
              writer.write(
                'message.part.delta',
                this.messageBuilder.appendReasoningDelta(assistantState, event.delta, 'text'),
                streamScope,
              );
            }
            return;
          }

          if (event.field === 'summary') {
            if (reasoningVisibility !== 'hidden') {
              finalReasoningSummary += event.delta;
              writer.write(
                'message.part.delta',
                this.messageBuilder.appendReasoningDelta(assistantState, event.delta, 'summary'),
                streamScope,
              );
            }
            return;
          }

          encryptedReasoningContent += event.delta;
          return;
        }

        if (event.type === 'text.delta') {
          if (!textPartStarted) {
            textPartStarted = true;
            writer.write('message.part.started', this.messageBuilder.startTextPart(assistantState), streamScope);
          }

          finalContent += event.delta;
          writer.write(
            'message.part.delta',
            this.messageBuilder.appendTextDelta(assistantState, event.delta),
            streamScope,
          );
          return;
        }

        if (event.type === 'tool.call.delta') {
          const current: PendingToolCall = pendingToolCalls.get(event.index) ?? {
            index: event.index,
            argumentsText: '',
            started: false,
          };
          current.toolCallId = event.toolCallId ?? current.toolCallId;
          current.toolName = event.toolName ?? current.toolName;
          current.source = current.toolName
            ? this.toolRegistry.findByName(current.toolName)?.source ?? current.source
            : current.source;
          current.argumentsText += event.argumentsDelta ?? '';
          pendingToolCalls.set(event.index, current);

          if (!current.started && current.toolCallId && current.toolName) {
            current.started = true;
            const source = current.source ?? 'custom';
            writer.write('tool.call.started', {
              toolCallId: current.toolCallId,
              toolName: current.toolName,
              source,
            }, streamScope);
            writer.write(
              'message.part.started',
              this.messageBuilder.startToolCallPart(assistantState, {
                toolCallId: current.toolCallId,
                toolName: current.toolName,
                source,
              }),
              streamScope,
            );
          }

          if (current.started && current.toolCallId && current.toolName && event.argumentsDelta) {
            writer.write('tool.call.delta', {
              toolCallId: current.toolCallId,
              toolName: current.toolName,
              argumentsDelta: event.argumentsDelta,
            }, streamScope);
            writer.write(
              'message.part.delta',
              this.messageBuilder.appendToolCallArgumentsDelta(
                assistantState,
                current.toolCallId,
                event.argumentsDelta,
              ),
              streamScope,
            );
          }
          return;
        }

        if (event.finishReason) {
          finishReason = event.finishReason;
        }
      };

      failureStage = 'provider_stream';
      for await (const event of this.providerAdapter.read(upstream)) {
        handleProviderEvent(event);
      }

      const validPendingToolCalls = Array.from(pendingToolCalls.values())
        .filter((toolCall): toolCall is PendingToolCall & { toolCallId: string; toolName: string } =>
          Boolean(toolCall.toolCallId && toolCall.toolName),
        )
        .sort((a, b) => a.index - b.index);

      if (validPendingToolCalls.length) {
        failureStage = 'tool_execution';
      }

      for (const pendingToolCall of validPendingToolCalls) {
        const tool = this.toolRegistry.findByName(pendingToolCall.toolName);
        const parsedArguments = this.parseToolArguments(pendingToolCall.argumentsText);
        const completedToolCall: CompletedToolCallPartInput = {
          toolCallId: pendingToolCall.toolCallId,
          toolName: pendingToolCall.toolName,
          source: tool?.source ?? pendingToolCall.source ?? 'custom',
          argumentsText: pendingToolCall.argumentsText,
          ...(parsedArguments.ok ? { arguments: parsedArguments.value } : {}),
          status: parsedArguments.ok && tool ? 'ready' : 'failed',
        };
        completedToolCalls.push(completedToolCall);
        writer.write('tool.call.completed', {
          toolCallId: completedToolCall.toolCallId,
          toolName: completedToolCall.toolName,
          argumentsText: completedToolCall.argumentsText,
          ...(completedToolCall.arguments ? { arguments: completedToolCall.arguments } : {}),
        }, streamScope);
        writer.write(
          'message.part.completed',
          this.messageBuilder.completeToolCallPart(assistantState, completedToolCall),
          streamScope,
        );

        writer.write('tool.result.started', {
          toolCallId: completedToolCall.toolCallId,
          toolName: completedToolCall.toolName,
        }, streamScope);
        writer.write(
          'message.part.started',
          this.messageBuilder.startToolResultPart(assistantState, completedToolCall),
          streamScope,
        );

        if (!tool || !parsedArguments.ok) {
          const errorCode = !tool ? 'TOOL_NOT_REGISTERED' : 'TOOL_ARGUMENTS_INVALID';
          let errorMessage = '模型请求了未注册工具';
          if (!parsedArguments.ok) {
            errorMessage = parsedArguments.error;
          }
          const failedResult: CompletedToolResultPartInput = {
            toolCallId: completedToolCall.toolCallId,
            toolName: completedToolCall.toolName,
            error: {
              code: errorCode,
              message: errorMessage,
            },
            status: 'failed',
          };
          completedToolResults.push(failedResult);
          writer.write('tool.result.completed', failedResult, streamScope);
          writer.write(
            'message.part.completed',
            this.messageBuilder.completeToolResultPart(assistantState, failedResult),
            streamScope,
          );
          continue;
        }

        // 单轮工具闭环：工具开始执行时先把 call part 标记为 running，执行完成后再落 done/failed。
        completedToolCall.status = 'running';
        writer.write(
          'message.part.completed',
          this.messageBuilder.completeToolCallPart(assistantState, completedToolCall),
          streamScope,
        );
        const executionResult = await this.toolExecutor.execute({
          toolCallId: completedToolCall.toolCallId,
          tool,
          arguments: parsedArguments.value,
        });
        const completedToolResult: CompletedToolResultPartInput = {
          toolCallId: completedToolCall.toolCallId,
          toolName: completedToolCall.toolName,
          ...(executionResult.result !== undefined ? { result: executionResult.result } : {}),
          ...(executionResult.error ? { error: executionResult.error } : {}),
          status: executionResult.error ? 'failed' : 'done',
        };
        completedToolCall.status = executionResult.error ? 'failed' : 'done';
        completedToolResults.push(completedToolResult);
        writer.write(
          'message.part.completed',
          this.messageBuilder.completeToolCallPart(assistantState, completedToolCall),
          streamScope,
        );
        writer.write('tool.result.completed', completedToolResult, streamScope);
        writer.write(
          'message.part.completed',
          this.messageBuilder.completeToolResultPart(assistantState, completedToolResult),
          streamScope,
        );
      }

      if (completedToolCalls.length) {
        const followUpDto = new ChatRequestDto();
        followUpDto.platform = platform;
        followUpDto.provider = platform;
        followUpDto.model = model;
        followUpDto.credentialId = dto.runtime?.credentialId;
        followUpDto.stream = true;
        followUpDto.temperature = dto.runtime?.temperature;
        followUpDto.max_tokens = dto.runtime?.maxTokens;
        followUpDto.fileIds = fileIds;
        followUpDto.reasoning = dto.runtime?.reasoning;
        followUpDto.messages = [
          ...prepared.llmMessages,
          {
            role: 'assistant',
            content: finalContent,
            tool_calls: completedToolCalls.map((toolCall) => ({
              id: toolCall.toolCallId,
              type: 'function' as const,
              function: {
                name: toolCall.toolName,
                arguments: toolCall.argumentsText,
              },
            })),
          },
          ...completedToolResults.map((toolResult) => ({
            role: 'tool',
            tool_call_id: toolResult.toolCallId,
            content: this.serializeToolResultForModel(toolResult),
          })),
        ];

        failureStage = 'provider_connect';
        const followUpStream = await this.aiProxyService.proxyChatStream(followUpDto);
        failureStage = 'provider_stream';
        for await (const event of this.providerAdapter.read(followUpStream)) {
          // 第一版只支持单轮工具调用，第二次请求不再携带 tools，若 provider 仍返回工具调用则忽略。
          if (event.type === 'tool.call.delta') continue;
          handleProviderEvent(event);
        }
      }

      if (!textPartStarted) {
        writer.write('message.part.started', this.messageBuilder.startTextPart(assistantState), streamScope);
      }

      writer.write(
        'message.part.completed',
        this.messageBuilder.completeTextPart(assistantState, finalContent),
        streamScope,
      );

      const completedReasoning = reasoningPartStarted
        ? this.createCompletedReasoning({
          visibility: reasoningVisibility,
          text: finalReasoningText,
          summary: finalReasoningSummary,
          encryptedContent: encryptedReasoningContent,
        })
        : undefined;
      if (completedReasoning) {
        writer.write(
          'message.part.completed',
          this.messageBuilder.completeReasoningPart(assistantState, completedReasoning),
          streamScope,
        );
      }

      const completedMessage = this.messageBuilder.buildCompletedAssistantMessage(
        assistantState,
        {
          content: finalContent,
          reasoning: completedReasoning,
          toolCalls: completedToolCalls,
          toolResults: completedToolResults,
        },
      );
      failureStage = 'persistence';
      await this.messageService.completeAssistantMessageV2({
        sessionId: prepared.sessionId,
        id: prepared.assistantMessageId,
        content: finalContent,
        parts: completedMessage.parts,
        provider: platform,
        model,
      });
      await this.conversation.markRequestComplete(effectiveUserId, requestId);

      writer.write(
        'message.completed',
        { message: completedMessage },
        {
          sessionId: prepared.sessionId,
          messageId: prepared.assistantMessageId,
        },
      );
      writer.write(
        'stream.completed',
        { finishReason },
        {
          sessionId: prepared.sessionId,
          messageId: prepared.assistantMessageId,
        },
      );

      this.logger.log(
        `v2 流完成: session=${prepared.sessionId}, request=${requestId}, 内容长度=${finalContent.length}`,
      );
      this.endResponse(res);
    } catch (error) {
      await this.writeFailure({
        error,
        res,
        writer,
        userId: effectiveUserId,
        requestId,
        failureContext,
        stage: failureStage,
      });
    }
  }

  private prepareSseResponse(res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
  }

  private extractTextProjection(parts: UserMessagePart[]): string {
    const text = parts
      .filter((part): part is Extract<UserMessagePart, { type: 'text' }> => part.type === 'text')
      .map((part) => part.text)
      .join('\n')
      .trim();

    // 现阶段 v2 仍把结构化 parts 投影成纯文本给历史主链和 OpenAI-compatible provider。
    return text || '[空文本消息]';
  }

  private extractFileIds(dto: ChatStreamRequestV2): string[] {
    const partFileIds = dto.input.parts
      .filter((part): part is Extract<UserMessagePart, { type: 'file' | 'image' }> =>
        part.type === 'file' || part.type === 'image',
      )
      .map((part) => part.fileId);
    const contextFileIds = dto.context?.fileIds ?? [];

    return Array.from(new Set([...partFileIds, ...contextFileIds].filter(Boolean)));
  }

  private resolveReasoningVisibility(
    display: NonNullable<NonNullable<ChatStreamRequestV2['runtime']>['reasoning']>['display'] | undefined,
  ): ReasoningMessagePart['visibility'] {
    if (display === 'none') return 'hidden';
    if (display === 'full') return 'full';
    return 'summary';
  }

  private createCompletedReasoning(
    input: CompletedReasoningPartInput,
  ): CompletedReasoningPartInput {
    return {
      visibility: input.visibility,
      ...(input.visibility === 'full' && input.text ? { text: input.text } : {}),
      ...((input.visibility === 'summary' || input.visibility === 'full') && input.summary
        ? { summary: input.summary }
        : {}),
      ...(input.encryptedContent ? { encryptedContent: input.encryptedContent } : {}),
    };
  }

  private parseToolArguments(argumentsText: string):
    | { ok: true; value: Record<string, unknown> }
    | { ok: false; error: string } {
    if (!argumentsText.trim()) {
      return { ok: true, value: {} };
    }

    try {
      const parsed = JSON.parse(argumentsText);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { ok: true, value: parsed as Record<string, unknown> };
      }
      return { ok: false, error: '工具参数必须是 JSON object' };
    } catch {
      return { ok: false, error: '工具参数不是合法 JSON' };
    }
  }

  private serializeToolResultForModel(result: CompletedToolResultPartInput): string {
    if (result.error) {
      return JSON.stringify({
        error: result.error,
      });
    }

    return JSON.stringify({
      result: result.result ?? null,
    });
  }

  private async writeFailure(params: {
    error: unknown;
    res: Response;
    writer: ReturnType<StreamEventWriterFactory>;
    userId: string;
    requestId: string;
    failureContext?: { sessionId: string; assistantMessageId: string; platform: string; model: string };
    stage: StreamFailureStage;
  }) {
    const { error, res, writer, userId, requestId, failureContext, stage } = params;
    const sanitized = sanitizeStreamError(error);
    const retryable = ![
      StreamErrorCode.CONFIG_ERROR,
      StreamErrorCode.UPSTREAM_HTTP_4XX,
    ].includes(sanitized.code);
    const isSessionNotFound = error instanceof NotFoundException;
    const code = isSessionNotFound ? 'SESSION_NOT_FOUND' : sanitized.code;
    const message = isSessionNotFound ? '会话不存在或无权访问' : sanitized.userMessage;
    const effectiveRetryable = isSessionNotFound ? false : retryable;

    await this.conversation.markRequestFailed(userId, requestId).catch(() => undefined);
    if (failureContext) {
      await this.messageService.failAssistantMessageV2({
        sessionId: failureContext.sessionId,
        id: failureContext.assistantMessageId,
        content: message,
        error: {
          code,
          message,
          retryable: effectiveRetryable,
          stage,
          detail: sanitized.logDetail,
        },
        provider: failureContext.platform,
        model: failureContext.model,
      }).catch((err) => {
        this.logger.warn(
          `v2 失败消息持久化失败: message=${failureContext.assistantMessageId}, err=${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      });
    }

    this.logger.error(
      `v2 流失败: request=${requestId}, session=${failureContext?.sessionId ?? 'n/a'}, message=${
        failureContext?.assistantMessageId ?? 'n/a'
      }, stage=${stage}, code=${code}`,
      sanitized.logDetail,
    );
    // v2 流建立后统一通过 stream.failed 承载错误，避免前端继续兼容 event:error/status:error/choices 错误块。
    writer.write('stream.failed', {
      code,
      message,
      retryable: effectiveRetryable,
      stage,
    }, failureContext ? {
      sessionId: failureContext.sessionId,
      messageId: failureContext.assistantMessageId,
    } : undefined);
    this.endResponse(res);
  }

  private endResponse(res: Response) {
    if (!res.writableEnded) {
      res.end();
    }
  }
}
