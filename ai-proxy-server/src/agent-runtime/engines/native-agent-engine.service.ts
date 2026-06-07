import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { AiProxyService } from '@/ai-proxy/ai-proxy.service';
import { ChatRequestDto, type ChatMessage } from '@/ai-proxy/dto/chat.dto';
import { sanitizeStreamError, StreamErrorCode } from '@/ai-proxy/errors/stream-error.util';
import { StreamFailureCoordinator } from '@/ai-proxy/stream-failure/stream-failure.coordinator';
import { TokenUsageEstimatorService } from '@/ai-proxy/token-usage-estimator.service';
import { ConversationApplicationService } from '@/conversation/conversation-application.service';
import { MessageService } from '@/message/message.service';
import { ModelProviderRegistryService } from '@/model-provider/model-provider-registry.service';
import { OpenAiCompatibleStreamAdapter } from '@/streaming/adapters/openai-compatible-stream.adapter';
import type { UserMessagePart } from '@/streaming/dto/chat-stream-v2.dto';
import type { ReasoningMessagePart } from '@/streaming/protocol/message-part.types';
import type { StreamEventScope } from '@/streaming/protocol/stream-event.types';
import {
  StreamMessageBuilderService,
  type CompletedFileReadPartInput,
  type CompletedReasoningPartInput,
  type CompletedToolCallPartInput,
  type CompletedToolResultPartInput,
} from '@/streaming/services/stream-message-builder.service';
import type { ToolDefinition } from '@/tools/dto/tool-definition.dto';
import {
  isFileReadToolResult,
  READ_ATTACHED_FILES_TOOL_NAME,
} from '@/tools/file-read-tool.types';
import {
  formatClientLocation,
  LOCATION_ACQUISITION_TOOL_NAME,
  parseClientLocation,
} from '@/tools/location-acquisition.types';
import type { AgentEnginePort } from '../ports/agent-engine.port';
import { DefaultToolGatewayService } from '../gateways/default-tool-gateway.service';
import type {
  AgentRunContext,
  AgentRunState,
  AgentRuntimeEvent,
  AgentRuntimeInput,
  AgentRuntimeSseEvent,
  PendingAgentToolCall,
} from '../agent-runtime.types';

@Injectable()
export class NativeAgentEngineService implements AgentEnginePort {
  private readonly logger = new Logger(NativeAgentEngineService.name);

  constructor(
    private readonly aiProxyService: AiProxyService,
    private readonly conversation: ConversationApplicationService,
    private readonly messageService: MessageService,
    private readonly modelProviderRegistry: ModelProviderRegistryService,
    private readonly providerAdapter: OpenAiCompatibleStreamAdapter,
    private readonly messageBuilder: StreamMessageBuilderService,
    private readonly toolGateway: DefaultToolGatewayService,
    private readonly tokenUsageEstimator: TokenUsageEstimatorService,
    private readonly failureCoordinator: StreamFailureCoordinator,
  ) {}

  async *run(input: AgentRuntimeInput): AsyncIterable<AgentRuntimeEvent> {
    const ctx: AgentRunContext = {
      requestId: input.requestId,
      traceId: input.traceId,
      userId: input.userId || 'anonymous',
      runtime: input.dto.runtime,
      credentialId: input.dto.runtime?.credentialId,
      audit: {
        engine: 'native',
        startedAt: new Date().toISOString(),
      },
    };
    const state = this.createInitialState(input, ctx.userId);

    try {
      this.normalizeInput(input, state);
      await this.resolveModel(input, ctx, state);
      this.applyPolicyGuard();
      await this.readAttachedFiles(ctx, state);
      await this.prepareConversation(input, ctx, state);

      yield {
        kind: 'header',
        name: 'X-Session-Id',
        value: state.prepared!.sessionId,
      };

      yield* this.emitInitialEvents(input, ctx, state);
      if (state.stopped) {
        yield { kind: 'end' };
        return;
      }

      this.assemblePrompt();
      this.buildProviderRequest(input, ctx, state);
      yield* this.emitCompletedFileReads(ctx, state);

      state.failureStage = 'provider_connect';
      const upstream = await this.aiProxyService.proxyChatStream(state.providerRequest!);
      state.failureStage = 'provider_stream';
      for await (const event of this.providerAdapter.read(upstream)) {
        yield* this.handleProviderEvent(event, ctx, state);
      }

      yield* this.runToolLoop(input, ctx, state);
      yield* await this.finalizeMessage(ctx, state);
      yield { kind: 'end' };
    } catch (error) {
      yield* await this.handleFailure(error, ctx, state);
      yield { kind: 'end' };
    }
  }

  private createInitialState(input: AgentRuntimeInput, effectiveUserId: string): AgentRunState {
    return {
      failureStage: 'prepare',
      effectiveUserId,
      autoGenerateSessionName: input.dto.runtime?.autoGenerateSessionName ?? true,
      textProjection: '',
      fileIds: [],
      promptMessagesForUsage: [],
      completedFileReads: [],
      finalContent: '',
      finalReasoningText: '',
      finalReasoningSummary: '',
      encryptedReasoningContent: '',
      textPartStarted: false,
      reasoningPartStarted: false,
      reasoningEnabled: input.dto.runtime?.reasoning?.enabled !== false,
      reasoningVisibility: this.resolveReasoningVisibility(input.dto.runtime?.reasoning?.display),
      pendingToolCalls: new Map<number, PendingAgentToolCall>(),
      completedToolCalls: [],
      completedToolResults: [],
      stopped: false,
    };
  }

  private normalizeInput(input: AgentRuntimeInput, state: AgentRunState): void {
    state.failureStage = 'prepare';
    state.textProjection = this.extractTextProjection(input.dto.input.parts);
    state.fileIds = this.extractFileIds(input.dto);
    state.clientLocation = parseClientLocation(input.dto.context?.clientLocation) ?? undefined;
  }

  private async resolveModel(
    input: AgentRuntimeInput,
    ctx: AgentRunContext,
    state: AgentRunState,
  ): Promise<void> {
    const platform = await this.modelProviderRegistry.resolveProvider(input.dto.runtime?.provider);
    const model = await this.modelProviderRegistry.resolveModel(
      platform,
      input.dto.runtime?.model,
      'llm',
    );
    const requestedTools = this.toolGateway.resolveRequestedTools(input.dto.runtime?.tools ?? []);
    const requestedToolChoice = input.dto.runtime?.toolChoice;

    if (
      requestedToolChoice
      && typeof requestedToolChoice === 'object'
      && !requestedTools.some((tool) => tool.name === requestedToolChoice.name)
    ) {
      throw new BadRequestException(`toolChoice 指定了未启用工具：${requestedToolChoice.name}`);
    }

    ctx.platform = platform;
    ctx.provider = platform;
    ctx.model = model;
    state.providerRequest = new ChatRequestDto();
    state.providerRequest.tools = requestedTools;
  }

  private applyPolicyGuard(): void {
    // 第一阶段默认放行。后续在这里接入输入级、模型级和工具级权限策略。
  }

  private async prepareConversation(
    input: AgentRuntimeInput,
    ctx: AgentRunContext,
    state: AgentRunState,
  ): Promise<void> {
    const prepared = await this.conversation.prepareSendMessage({
      userId: state.effectiveUserId,
      query: state.textProjection,
      sessionId: input.dto.sessionId,
      requestId: input.requestId,
      clientMessageId: input.dto.clientMessageId,
      inputParts: input.dto.input.parts,
      fileIds: state.fileIds,
      attachmentRead: state.attachmentRead,
      autoGenerateSessionName: state.autoGenerateSessionName,
      platform: ctx.platform!,
      provider: ctx.platform!,
      model: ctx.model!,
      credentialId: input.dto.runtime?.credentialId,
    });

    state.prepared = prepared;
    ctx.sessionId = prepared.sessionId;
    ctx.assistantMessageId = prepared.assistantMessageId;
    ctx.userMessageId = prepared.userMessageId;
    this.logger.log(`v2 流开始: session=${prepared.sessionId}, request=${input.requestId}`);
  }

  private *emitInitialEvents(
    input: AgentRuntimeInput,
    ctx: AgentRunContext,
    state: AgentRunState,
  ): Iterable<AgentRuntimeEvent> {
    const prepared = state.prepared!;
    const streamScope = this.streamScope(ctx);
    const assistantState = this.assistantState(ctx);

    yield this.sse(
      'stream.started',
      {
        provider: ctx.platform,
        model: ctx.model,
        createdAt: new Date().toISOString(),
      },
      { sessionId: prepared.sessionId },
    );

    if (prepared.isNewSession && prepared.session) {
      yield this.sse(
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

    yield this.sse(
      'message.created',
      {
        userMessage: this.messageBuilder.createUserSnapshot({
          userMessageId: prepared.userMessageId,
          content: state.textProjection,
          parts: prepared.userMessageParts ?? [],
        }),
        assistantMessage: this.messageBuilder.createAssistantSnapshot(assistantState),
        clientMessageId: prepared.clientMessageId ?? input.dto.clientMessageId,
      },
      streamScope,
    );

    if (prepared.isReplay) {
      yield this.sse(
        'stream.failed',
        {
          code: 'REQUEST_ALREADY_IN_PROGRESS',
          message: '同一请求正在处理或已完成，请刷新会话消息确认结果',
          retryable: prepared.requestStatus !== 'failed',
          stage: 'prepare',
        },
        streamScope,
      );
      state.stopped = true;
    }
  }

  private assemblePrompt(): void {
    // 第一阶段沿用 ConversationApplicationService 准备好的 llmMessages。
    // 后续 PromptAssemblyStep 会在这里合成 system prompt、memory、文件摘要和工具说明。
  }

  private buildProviderRequest(
    input: AgentRuntimeInput,
    ctx: AgentRunContext,
    state: AgentRunState,
  ): void {
    const requestDto = state.providerRequest ?? new ChatRequestDto();
    requestDto.platform = ctx.platform;
    requestDto.provider = ctx.platform;
    requestDto.model = ctx.model;
    requestDto.credentialId = input.dto.runtime?.credentialId;
    requestDto.stream = true;
    requestDto.messages = this.injectAttachmentContext(
      state.prepared!.llmMessages,
      state.attachmentRead?.attachmentContext,
    );
    requestDto.temperature = input.dto.runtime?.temperature;
    requestDto.max_tokens = input.dto.runtime?.maxTokens;
    requestDto.fileIds = state.fileIds;
    requestDto.reasoning = input.dto.runtime?.reasoning;
    requestDto.toolChoice = input.dto.runtime?.toolChoice;
    state.providerRequest = requestDto;
    state.promptMessagesForUsage = [...requestDto.messages];
    state.completedFileReads = state.prepared!.attachmentReadResults.map((result) => ({
      fileId: result.fileId,
      name: result.name,
      ...(result.mimeType ? { mimeType: result.mimeType } : {}),
      ...(result.tokenEstimate !== undefined ? { tokenEstimate: result.tokenEstimate } : {}),
      status: result.status,
      ...(result.reason ? { reason: result.reason } : {}),
    }));
  }

  private *emitCompletedFileReads(
    ctx: AgentRunContext,
    state: AgentRunState,
  ): Iterable<AgentRuntimeEvent> {
    for (const fileRead of state.completedFileReads) {
      yield this.sse(
        'message.part.started',
        this.messageBuilder.startFileReadPart(this.assistantState(ctx), fileRead),
        this.streamScope(ctx),
      );
      yield this.sse(
        'message.part.completed',
        this.messageBuilder.completeFileReadPart(this.assistantState(ctx), fileRead),
        this.streamScope(ctx),
      );
    }
  }

  private async readAttachedFiles(
    ctx: AgentRunContext,
    state: AgentRunState,
  ): Promise<void> {
    if (!state.fileIds.length) return;

    state.failureStage = 'tool_execution';
    const tool = this.toolGateway.findInternalTool('builtin', READ_ATTACHED_FILES_TOOL_NAME);
    if (!tool) {
      throw new BadRequestException('内部文件读取工具未注册');
    }

    const result = await this.toolGateway.execute({
      toolCallId: `internal:${ctx.requestId}:${READ_ATTACHED_FILES_TOOL_NAME}`,
      tool,
      arguments: {
        fileIds: state.fileIds,
        userId: state.effectiveUserId,
      },
      skipResultTruncation: true,
    });

    if (result.error) {
      throw new BadRequestException(result.error.message);
    }
    if (!isFileReadToolResult(result.result)) {
      throw new BadRequestException('内部文件读取工具返回结果不合法');
    }

    state.attachmentRead = result.result;
    state.failureStage = 'prepare';
  }

  private injectAttachmentContext(messages: ChatMessage[], attachmentContext?: string): ChatMessage[] {
    const cloned = messages.map((message) => ({ ...message }));
    if (!attachmentContext || cloned.length === 0) {
      return cloned;
    }

    const last = cloned[cloned.length - 1];
    if (last.role === 'user') {
      last.content = `${attachmentContext}\n\n${last.content}`;
    }
    return cloned;
  }

  private *handleProviderEvent(
    event,
    ctx: AgentRunContext,
    state: AgentRunState,
  ): Iterable<AgentRuntimeEvent> {
    if (event.type === 'reasoning.delta') {
      if (!state.reasoningEnabled) return;

      if (!state.reasoningPartStarted) {
        state.reasoningPartStarted = true;
        yield this.sse(
          'message.part.started',
          this.messageBuilder.startReasoningPart(this.assistantState(ctx), state.reasoningVisibility),
          this.streamScope(ctx),
        );
      }

      if (event.field === 'text') {
        if (state.reasoningVisibility === 'full') {
          state.finalReasoningText += event.delta;
          yield this.sse(
            'message.part.delta',
            this.messageBuilder.appendReasoningDelta(this.assistantState(ctx), event.delta, 'text'),
            this.streamScope(ctx),
          );
        } else if (state.reasoningVisibility === 'summary') {
          state.finalReasoningSummary += event.delta;
          yield this.sse(
            'message.part.delta',
            this.messageBuilder.appendReasoningDelta(this.assistantState(ctx), event.delta, 'summary'),
            this.streamScope(ctx),
          );
        }
        return;
      }

      if (event.field === 'summary') {
        if (state.reasoningVisibility !== 'hidden') {
          state.finalReasoningSummary += event.delta;
          yield this.sse(
            'message.part.delta',
            this.messageBuilder.appendReasoningDelta(this.assistantState(ctx), event.delta, 'summary'),
            this.streamScope(ctx),
          );
        }
        return;
      }

      state.encryptedReasoningContent += event.delta;
      return;
    }

    if (event.type === 'text.delta') {
      if (!state.textPartStarted) {
        state.textPartStarted = true;
        yield this.sse(
          'message.part.started',
          this.messageBuilder.startTextPart(this.assistantState(ctx)),
          this.streamScope(ctx),
        );
      }

      state.finalContent += event.delta;
      yield this.sse(
        'message.part.delta',
        this.messageBuilder.appendTextDelta(this.assistantState(ctx), event.delta),
        this.streamScope(ctx),
      );
      return;
    }

    if (event.type === 'tool.call.delta') {
      const current: PendingAgentToolCall = state.pendingToolCalls.get(event.index) ?? {
        index: event.index,
        argumentsText: '',
        started: false,
      };
      current.toolCallId = event.toolCallId ?? current.toolCallId;
      current.toolName = event.toolName ?? current.toolName;
      current.source = current.toolName
        ? this.toolGateway.findByName(current.toolName)?.source ?? current.source
        : current.source;
      current.argumentsText += event.argumentsDelta ?? '';
      state.pendingToolCalls.set(event.index, current);

      if (!current.started && current.toolCallId && current.toolName) {
        current.started = true;
        const source = current.source ?? 'custom';
        yield this.sse(
          'tool.call.started',
          {
            toolCallId: current.toolCallId,
            toolName: current.toolName,
            source,
          },
          this.streamScope(ctx),
        );
        yield this.sse(
          'message.part.started',
          this.messageBuilder.startToolCallPart(this.assistantState(ctx), {
            toolCallId: current.toolCallId,
            toolName: current.toolName,
            source,
          }),
          this.streamScope(ctx),
        );
      }

      if (current.started && current.toolCallId && current.toolName && event.argumentsDelta) {
        yield this.sse(
          'tool.call.delta',
          {
            toolCallId: current.toolCallId,
            toolName: current.toolName,
            argumentsDelta: event.argumentsDelta,
          },
          this.streamScope(ctx),
        );
        yield this.sse(
          'message.part.delta',
          this.messageBuilder.appendToolCallArgumentsDelta(
            this.assistantState(ctx),
            current.toolCallId,
            event.argumentsDelta,
          ),
          this.streamScope(ctx),
        );
      }
      return;
    }

    if (event.finishReason) {
      state.finishReason = event.finishReason;
    }
  }

  private async *runToolLoop(
    input: AgentRuntimeInput,
    ctx: AgentRunContext,
    state: AgentRunState,
  ): AsyncIterable<AgentRuntimeEvent> {
    const validPendingToolCalls = Array.from(state.pendingToolCalls.values())
      .filter((toolCall): toolCall is PendingAgentToolCall & { toolCallId: string; toolName: string } =>
        Boolean(toolCall.toolCallId && toolCall.toolName),
      )
      .sort((a, b) => a.index - b.index);

    if (validPendingToolCalls.length) {
      state.failureStage = 'tool_execution';
    }

    for (const pendingToolCall of validPendingToolCalls) {
      yield* await this.executeToolCall(pendingToolCall, ctx, state);
    }

    if (!state.completedToolCalls.length) return;

    const followUpDto = new ChatRequestDto();
    followUpDto.platform = ctx.platform;
    followUpDto.provider = ctx.platform;
    followUpDto.model = ctx.model;
    followUpDto.credentialId = input.dto.runtime?.credentialId;
    followUpDto.stream = true;
    followUpDto.temperature = input.dto.runtime?.temperature;
    followUpDto.max_tokens = input.dto.runtime?.maxTokens;
    followUpDto.fileIds = state.fileIds;
    followUpDto.reasoning = input.dto.runtime?.reasoning;
    const baseMessages = state.providerRequest?.messages ?? state.prepared!.llmMessages;
    followUpDto.messages = [
      ...baseMessages,
      {
        role: 'assistant',
        content: state.finalContent,
        tool_calls: state.completedToolCalls.map((toolCall) => ({
          id: toolCall.toolCallId,
          type: 'function' as const,
          function: {
            name: toolCall.toolName,
            arguments: toolCall.argumentsText,
          },
        })),
      },
      ...state.completedToolResults.map((toolResult) => ({
        role: 'tool',
        tool_call_id: toolResult.toolCallId,
        content: this.serializeToolResultForModel(toolResult),
      })),
    ];
    state.promptMessagesForUsage.push(...followUpDto.messages);

    state.failureStage = 'provider_connect';
    const followUpStream = await this.aiProxyService.proxyChatStream(followUpDto);
    state.failureStage = 'provider_stream';
    for await (const event of this.providerAdapter.read(followUpStream)) {
      if (event.type === 'tool.call.delta') continue;
      yield* this.handleProviderEvent(event, ctx, state);
    }
  }

  private async executeToolCall(
    pendingToolCall: PendingAgentToolCall & { toolCallId: string; toolName: string },
    ctx: AgentRunContext,
    state: AgentRunState,
  ): Promise<AgentRuntimeEvent[]> {
    const events: AgentRuntimeEvent[] = [];
    const tool = this.toolGateway.findByName(pendingToolCall.toolName);
    const parsedArguments = this.parseToolArguments(pendingToolCall.argumentsText);
    const completedToolCall: CompletedToolCallPartInput = {
      toolCallId: pendingToolCall.toolCallId,
      toolName: pendingToolCall.toolName,
      source: tool?.source ?? pendingToolCall.source ?? 'custom',
      argumentsText: pendingToolCall.argumentsText,
      ...(parsedArguments.ok ? { arguments: parsedArguments.value } : {}),
      status: parsedArguments.ok && tool ? 'ready' : 'failed',
    };
    state.completedToolCalls.push(completedToolCall);
    events.push(this.sse(
      'tool.call.completed',
      {
        toolCallId: completedToolCall.toolCallId,
        toolName: completedToolCall.toolName,
        argumentsText: completedToolCall.argumentsText,
        ...(completedToolCall.arguments ? { arguments: completedToolCall.arguments } : {}),
      },
      this.streamScope(ctx),
    ));
    events.push(this.sse(
      'message.part.completed',
      this.messageBuilder.completeToolCallPart(this.assistantState(ctx), completedToolCall),
      this.streamScope(ctx),
    ));
    events.push(this.sse(
      'tool.result.started',
      {
        toolCallId: completedToolCall.toolCallId,
        toolName: completedToolCall.toolName,
      },
      this.streamScope(ctx),
    ));
    events.push(this.sse(
      'message.part.started',
      this.messageBuilder.startToolResultPart(this.assistantState(ctx), completedToolCall),
      this.streamScope(ctx),
    ));

    if (!tool || !parsedArguments.ok) {
      const errorCode = !tool ? 'TOOL_NOT_REGISTERED' : 'TOOL_ARGUMENTS_INVALID';
      const failedResult: CompletedToolResultPartInput = {
        toolCallId: completedToolCall.toolCallId,
        toolName: completedToolCall.toolName,
        error: {
          code: errorCode,
          message: parsedArguments.ok ? '模型请求了未注册工具' : parsedArguments.error,
        },
        status: 'failed',
      };
      state.completedToolResults.push(failedResult);
      events.push(this.sse('tool.result.completed', failedResult, this.streamScope(ctx)));
      events.push(this.sse(
        'message.part.completed',
        this.messageBuilder.completeToolResultPart(this.assistantState(ctx), failedResult),
        this.streamScope(ctx),
      ));
      return events;
    }

    completedToolCall.status = 'running';
    events.push(this.sse(
      'message.part.completed',
      this.messageBuilder.completeToolCallPart(this.assistantState(ctx), completedToolCall),
      this.streamScope(ctx),
    ));
    const executionResult = await this.toolGateway.execute({
      toolCallId: completedToolCall.toolCallId,
      tool,
      arguments: this.buildToolExecutionArguments(pendingToolCall.toolName, parsedArguments.value, state),
    });
    const completedToolResult: CompletedToolResultPartInput = {
      toolCallId: completedToolCall.toolCallId,
      toolName: completedToolCall.toolName,
      ...(executionResult.result !== undefined ? { result: executionResult.result } : {}),
      ...(executionResult.error ? { error: executionResult.error } : {}),
      status: executionResult.error ? 'failed' : 'done',
    };
    completedToolCall.status = executionResult.error ? 'failed' : 'done';
    state.completedToolResults.push(completedToolResult);
    events.push(this.sse(
      'message.part.completed',
      this.messageBuilder.completeToolCallPart(this.assistantState(ctx), completedToolCall),
      this.streamScope(ctx),
    ));
    events.push(this.sse('tool.result.completed', completedToolResult, this.streamScope(ctx)));
    events.push(this.sse(
      'message.part.completed',
      this.messageBuilder.completeToolResultPart(this.assistantState(ctx), completedToolResult),
      this.streamScope(ctx),
    ));
    return events;
  }

  private async finalizeMessage(
    ctx: AgentRunContext,
    state: AgentRunState,
  ): Promise<AgentRuntimeEvent[]> {
    const events: AgentRuntimeEvent[] = [];
    const assistantState = this.assistantState(ctx);
    const streamScope = this.streamScope(ctx);

    if (!state.textPartStarted) {
      events.push(this.sse(
        'message.part.started',
        this.messageBuilder.startTextPart(assistantState),
        streamScope,
      ));
    }

    events.push(this.sse(
      'message.part.completed',
      this.messageBuilder.completeTextPart(assistantState, state.finalContent),
      streamScope,
    ));

    const completedReasoning = state.reasoningPartStarted
      ? this.createCompletedReasoning({
        visibility: state.reasoningVisibility,
        text: state.finalReasoningText,
        summary: state.finalReasoningSummary,
        encryptedContent: state.encryptedReasoningContent,
      })
      : undefined;

    if (completedReasoning) {
      events.push(this.sse(
        'message.part.completed',
        this.messageBuilder.completeReasoningPart(assistantState, completedReasoning),
        streamScope,
      ));
    }

    const completedMessage = this.messageBuilder.buildCompletedAssistantMessage(
      assistantState,
      {
        content: state.finalContent,
        fileReads: state.completedFileReads,
        reasoning: completedReasoning,
        toolCalls: state.completedToolCalls,
        toolResults: state.completedToolResults,
      },
    );
    const usage = this.estimateUsageSafely({
      promptMessages: state.promptMessagesForUsage,
      completionText: state.finalContent,
      reasoningText: [
        state.finalReasoningText,
        state.finalReasoningSummary,
        state.encryptedReasoningContent,
      ].filter(Boolean).join('\n'),
      toolArgumentsText: state.completedToolCalls
        .map((toolCall) => toolCall.argumentsText)
        .filter(Boolean)
        .join('\n'),
    });

    state.failureStage = 'persistence';
    await this.messageService.completeAssistantMessageV2({
      sessionId: ctx.sessionId!,
      id: ctx.assistantMessageId!,
      content: state.finalContent,
      parts: completedMessage.parts,
      provider: ctx.platform,
      model: ctx.model,
      ...(usage ? { usage } : {}),
    });
    await this.conversation.markRequestComplete(state.effectiveUserId, ctx.requestId);

    events.push(this.sse(
      'message.completed',
      { message: completedMessage },
      streamScope,
    ));
    events.push(this.sse(
      'stream.completed',
      {
        finishReason: state.finishReason,
        ...(usage ? { usage } : {}),
      },
      streamScope,
    ));

    this.logger.log(
      `v2 流完成: session=${ctx.sessionId}, request=${ctx.requestId}, 内容长度=${state.finalContent.length}`,
    );
    return events;
  }

  private async handleFailure(
    error: unknown,
    ctx: AgentRunContext,
    state: AgentRunState,
  ): Promise<AgentRuntimeEvent[]> {
    const sanitized = sanitizeStreamError(error);
    const retryable = ![
      StreamErrorCode.CONFIG_ERROR,
      StreamErrorCode.UPSTREAM_HTTP_4XX,
    ].includes(sanitized.code);
    const isSessionNotFound = error instanceof NotFoundException;
    const code = isSessionNotFound ? 'SESSION_NOT_FOUND' : sanitized.code;
    const message = isSessionNotFound ? '会话不存在或无权访问' : sanitized.userMessage;
    const effectiveRetryable = isSessionNotFound ? false : retryable;

    await this.conversation.markRequestFailed(state.effectiveUserId, ctx.requestId).catch(() => undefined);

    if (ctx.sessionId && ctx.assistantMessageId) {
      await this.messageService.failAssistantMessageV2({
        sessionId: ctx.sessionId,
        id: ctx.assistantMessageId,
        content: message,
        error: {
          code,
          message,
          retryable: effectiveRetryable,
          stage: state.failureStage,
          detail: sanitized.logDetail,
        },
        provider: ctx.platform,
        model: ctx.model,
      }).catch((err) => {
        this.logger.warn(
          `v2 失败消息持久化失败: message=${ctx.assistantMessageId}, err=${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }

    await this.failureCoordinator.dispatch(
      {
        sessionId: ctx.sessionId,
        assistantMessageId: ctx.assistantMessageId,
        userId: state.effectiveUserId,
        platform: ctx.platform ?? 'unknown',
        model: ctx.model ?? 'unknown',
      },
      error,
      {
        writeSse: false,
        persist: false,
        stage: state.failureStage,
      },
    );

    return [
      this.sse(
        'stream.failed',
        {
          code,
          message,
          retryable: effectiveRetryable,
          stage: state.failureStage,
        },
        ctx.sessionId && ctx.assistantMessageId ? this.streamScope(ctx) : undefined,
      ),
    ];
  }

  private extractTextProjection(parts: UserMessagePart[]): string {
    const text = parts
      .filter((part): part is Extract<UserMessagePart, { type: 'text' }> => part.type === 'text')
      .map((part) => part.text)
      .join('\n')
      .trim();

    return text || '[空文本消息]';
  }

  private buildToolExecutionArguments(
    toolName: string,
    parsedArguments: Record<string, unknown>,
    state: AgentRunState,
  ): Record<string, unknown> {
    if (toolName !== LOCATION_ACQUISITION_TOOL_NAME || !state.clientLocation) {
      return parsedArguments;
    }

    return {
      ...parsedArguments,
      location: formatClientLocation(state.clientLocation),
    };
  }

  private extractFileIds(dto: AgentRuntimeInput['dto']): string[] {
    const partFileIds = dto.input.parts
      .filter((part): part is Extract<UserMessagePart, { type: 'file' | 'image' }> =>
        part.type === 'file' || part.type === 'image',
      )
      .map((part) => part.fileId);
    const contextFileIds = dto.context?.fileIds ?? [];

    return Array.from(new Set([...partFileIds, ...contextFileIds].filter(Boolean)));
  }

  private resolveReasoningVisibility(
    display: NonNullable<NonNullable<AgentRuntimeInput['dto']['runtime']>['reasoning']>['display'] | undefined,
  ): ReasoningMessagePart['visibility'] {
    if (display === 'none') return 'hidden';
    if (display === 'full') return 'full';
    return 'summary';
  }

  private createCompletedReasoning(input: CompletedReasoningPartInput): CompletedReasoningPartInput {
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

  private estimateUsageSafely(input: {
    promptMessages: ChatMessage[];
    completionText: string;
    reasoningText?: string;
    toolArgumentsText?: string;
  }) {
    try {
      return this.tokenUsageEstimator.estimate(input);
    } catch (error) {
      this.logger.warn(
        `token usage 估算失败: ${error instanceof Error ? error.message : String(error)}`,
      );
      return undefined;
    }
  }

  private assistantState(ctx: AgentRunContext) {
    return {
      sessionId: ctx.sessionId!,
      assistantMessageId: ctx.assistantMessageId!,
    };
  }

  private streamScope(ctx: AgentRunContext): StreamEventScope {
    return {
      sessionId: ctx.sessionId,
      messageId: ctx.assistantMessageId,
    };
  }

  private sse(
    type: AgentRuntimeSseEvent['type'],
    data: unknown,
    scope?: StreamEventScope,
  ): AgentRuntimeSseEvent {
    return {
      kind: 'sse',
      type,
      data,
      scope,
    };
  }
}
