import { Injectable, Logger } from '@nestjs/common';
import type { IncomingMessage } from 'http';
import {
  ProviderStreamAdapter,
  type ProviderStreamEvent,
} from './provider-stream-adapter.interface';

@Injectable()
export class OpenAiCompatibleStreamAdapter implements ProviderStreamAdapter {
  private readonly logger = new Logger(OpenAiCompatibleStreamAdapter.name);

  async *read(upstream: IncomingMessage): AsyncIterable<ProviderStreamEvent> {
    let buffer = '';
    let doneEmitted = false;

    for await (const chunk of upstream) {
      buffer += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';

      for (const event of events) {
        const normalizedEvents = this.parseEvent(event);
        for (const normalized of normalizedEvents) {
          if (normalized.type === 'done') {
            doneEmitted = true;
          }
          yield normalized;
        }
      }
    }

    if (buffer.trim()) {
      const normalizedEvents = this.parseEvent(buffer);
      for (const normalized of normalizedEvents) {
        if (normalized.type === 'done') {
          doneEmitted = true;
        }
        yield normalized;
      }
    }

    if (!doneEmitted) {
      yield { type: 'done' };
    }
  }

  private parseEvent(event: string): ProviderStreamEvent[] {
    const dataLines = event
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim());

    if (!dataLines.length) return [];

    const data = dataLines.join('\n');
    if (data === '[DONE]') {
      return [{ type: 'done' }];
    }

    try {
      const parsed = JSON.parse(data);
      const choice = parsed.choices?.[0];
      const deltaPayload = choice?.delta ?? {};
      const messagePayload = choice?.message ?? {};
      const delta = deltaPayload.content;
      const finishReason = choice?.finish_reason;
      const normalizedEvents: ProviderStreamEvent[] = [];

      if (typeof delta === 'string' && delta.length > 0) {
        normalizedEvents.push({ type: 'text.delta', delta });
      }

      if (Array.isArray(deltaPayload.tool_calls)) {
        deltaPayload.tool_calls.forEach((toolCall: unknown) => {
          const item = toolCall as {
            index?: number;
            id?: string;
            function?: { name?: string; arguments?: string };
          };
          normalizedEvents.push({
            type: 'tool.call.delta',
            index: typeof item.index === 'number' ? item.index : 0,
            toolCallId: typeof item.id === 'string' ? item.id : undefined,
            toolName: typeof item.function?.name === 'string' ? item.function.name : undefined,
            argumentsDelta: typeof item.function?.arguments === 'string'
              ? item.function.arguments
              : undefined,
          });
        });
      }

      // DeepSeek 等 OpenAI-compatible provider 会把思考过程放在 reasoning_content；
      // 这里仅归一化字段，不拼入普通 content，也不记录具体内容。
      this.appendReasoningDelta(normalizedEvents, deltaPayload.reasoning_content, 'text');
      this.appendReasoningDelta(normalizedEvents, deltaPayload.reasoning, 'text');
      this.appendReasoningDelta(normalizedEvents, deltaPayload.thinking, 'text');
      this.appendReasoningDelta(normalizedEvents, deltaPayload.reasoning_summary, 'summary');
      this.appendReasoningDelta(normalizedEvents, deltaPayload.summary, 'summary');
      this.appendReasoningDelta(normalizedEvents, deltaPayload.encrypted_content, 'encryptedContent');
      this.appendReasoningDelta(normalizedEvents, deltaPayload.encrypted_reasoning_content, 'encryptedContent');
      this.appendReasoningDelta(normalizedEvents, messagePayload.reasoning_summary, 'summary');
      this.appendReasoningDelta(normalizedEvents, messagePayload.encrypted_content, 'encryptedContent');

      if (finishReason) {
        normalizedEvents.push({ type: 'done', finishReason });
      }

      return normalizedEvents;
    } catch (error) {
      this.logger.debug(
        `跳过无法解析的上游 SSE 块: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return [];
  }

  private appendReasoningDelta(
    events: ProviderStreamEvent[],
    value: unknown,
    field: 'text' | 'summary' | 'encryptedContent',
  ) {
    if (typeof value === 'string' && value.length > 0) {
      events.push({
        type: 'reasoning.delta',
        delta: value,
        field,
      });
    }
  }
}
