import { Injectable } from '@nestjs/common';
import type { ChatMessage } from './dto/chat.dto';
import { TokenUsageEstimatorService } from './token-usage-estimator.service';
import { toLlmMessages, type MessageWithMetadata } from '../message/message-filter.util';

export interface BuildContextInput {
  rawMessages: MessageWithMetadata[];
  maxPromptTokens?: number;
  recentMessageLimit?: number;
}

export interface BuildContextDebug {
  rawMessageCount: number;
  candidateMessageCount: number;
  selectedMessageCount: number;
  estimatedPromptTokens: number;
  maxPromptTokens: number;
  recentMessageLimit: number;
  truncated: boolean;
}

export interface BuildContextResult {
  messages: ChatMessage[];
  debug: BuildContextDebug;
}

const DEFAULT_MAX_PROMPT_TOKENS = 6000;
const DEFAULT_RECENT_MESSAGE_LIMIT = 5;

@Injectable()
export class ContextBuilderService {
  constructor(private readonly tokenEstimator: TokenUsageEstimatorService) {}

  build(input: BuildContextInput): BuildContextResult {
    const maxPromptTokens = input.maxPromptTokens ?? DEFAULT_MAX_PROMPT_TOKENS;
    const recentMessageLimit = input.recentMessageLimit ?? DEFAULT_RECENT_MESSAGE_LIMIT;
    const candidates = toLlmMessages(input.rawMessages);
    const allTokens = this.estimatePromptTokens(candidates);

    if (allTokens <= maxPromptTokens) {
      return {
        messages: candidates,
        debug: {
          rawMessageCount: input.rawMessages.length,
          candidateMessageCount: candidates.length,
          selectedMessageCount: candidates.length,
          estimatedPromptTokens: allTokens,
          maxPromptTokens,
          recentMessageLimit,
          truncated: false,
        },
      };
    }

    const selectedReversed: ChatMessage[] = [];
    let selectedTokens = 0;

    for (let index = candidates.length - 1; index >= 0; index -= 1) {
      const message = candidates[index];
      const nextMessages = [...selectedReversed, message].reverse();
      const nextTokens = this.estimatePromptTokens(nextMessages);
      const isLatestMessage = selectedReversed.length === 0;

      if (!isLatestMessage && nextTokens > maxPromptTokens) {
        break;
      }

      selectedReversed.push(message);
      selectedTokens = nextTokens;
    }

    const messages = selectedReversed.reverse();

    return {
      messages,
      debug: {
        rawMessageCount: input.rawMessages.length,
        candidateMessageCount: candidates.length,
        selectedMessageCount: messages.length,
        estimatedPromptTokens: selectedTokens,
        maxPromptTokens,
        recentMessageLimit,
        truncated: messages.length < candidates.length,
      },
    };
  }

  private estimatePromptTokens(messages: ChatMessage[]): number {
    return this.tokenEstimator.estimate({
      promptMessages: messages,
      completionText: '',
    }).promptTokens;
  }
}
