import { Injectable } from '@nestjs/common';
import type { ChatMessage } from './dto/chat.dto';

export interface TokenUsageEstimateInput {
  promptMessages: ChatMessage[];
  completionText: string;
  reasoningText?: string;
  toolArgumentsText?: string;
}

export interface TokenUsageEstimateResult {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  source: 'estimated';
  strategy: 'chars-div-4';
}

@Injectable()
export class TokenUsageEstimatorService {
  estimate(input: TokenUsageEstimateInput): TokenUsageEstimateResult {
    const promptText = input.promptMessages
      .map((message) => this.messageToEstimatedText(message))
      .filter(Boolean)
      .join('\n');
    const completionText = [
      input.completionText,
      input.reasoningText,
      input.toolArgumentsText,
    ]
      .filter((text): text is string => Boolean(text))
      .join('\n');

    const promptTokens = this.estimateTextTokens(promptText);
    const completionTokens = this.estimateTextTokens(completionText);

    return {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      source: 'estimated',
      strategy: 'chars-div-4',
    };
  }

  private estimateTextTokens(text: string | undefined): number {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  private messageToEstimatedText(message: ChatMessage): string {
    const fragments = [message.role, message.content];

    if (message.tool_call_id) {
      fragments.push(message.tool_call_id);
    }

    if (message.tool_calls?.length) {
      message.tool_calls.forEach((toolCall) => {
        fragments.push(toolCall.id, toolCall.function.name, toolCall.function.arguments);
      });
    }

    return fragments.filter(Boolean).join('\n');
  }
}
