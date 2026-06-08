import { ContextBuilderService } from './context-builder.service';
import { TokenUsageEstimatorService } from './token-usage-estimator.service';
import type { MessageWithMetadata } from '../message/message-filter.util';

function message(
  role: string,
  content: string,
  metadata?: Record<string, unknown>,
): MessageWithMetadata {
  return { role, content, metadata };
}

describe('ContextBuilderService', () => {
  let service: ContextBuilderService;

  beforeEach(() => {
    service = new ContextBuilderService(new TokenUsageEstimatorService());
  });

  it('预算足够时保留全部可用历史消息', () => {
    const result = service.build({
      rawMessages: [
        message('user', '你好'),
        message('assistant', '你好，有什么可以帮你？'),
      ],
      maxPromptTokens: 1000,
    });

    expect(result.messages).toEqual([
      { role: 'user', content: '你好' },
      { role: 'assistant', content: '你好，有什么可以帮你？' },
    ]);
    expect(result.debug.truncated).toBe(false);
    expect(result.debug.rawMessageCount).toBe(2);
    expect(result.debug.selectedMessageCount).toBe(2);
  });

  it('超出预算时从旧消息开始裁剪并保留最近上下文', () => {
    const rawMessages = Array.from({ length: 8 }, (_, index) =>
      message(index % 2 === 0 ? 'user' : 'assistant', `第${index + 1}条 ${'x'.repeat(80)}`),
    );

    const result = service.build({
      rawMessages,
      maxPromptTokens: 70,
    });

    expect(result.debug.truncated).toBe(true);
    expect(result.debug.selectedMessageCount).toBeLessThan(rawMessages.length);
    expect(result.messages.at(-1)?.content).toContain('第8条');
    expect(result.messages[0].content).not.toContain('第1条');
    expect(result.debug.estimatedPromptTokens).toBeLessThanOrEqual(result.debug.maxPromptTokens);
  });

  it('沿用消息投影规则过滤失败消息并从 parts 回投影文本', () => {
    const result = service.build({
      rawMessages: [
        message('user', '保留我'),
        message('assistant', '失败回答', { status: 'failed' }),
        message('assistant', '', {
          parts: [
            { id: 'reasoning-1', type: 'reasoning', summary: '不应进入正文' },
            { id: 'text-1', type: 'text', text: '结构化正文' },
          ],
        }),
      ],
      maxPromptTokens: 1000,
    });

    expect(result.messages).toEqual([
      { role: 'user', content: '保留我' },
      { role: 'assistant', content: '结构化正文' },
    ]);
    expect(result.debug.candidateMessageCount).toBe(2);
  });

  it('最新单条消息超过预算时仍保留一条避免空 payload', () => {
    const result = service.build({
      rawMessages: [
        message('user', '旧消息'),
        message('assistant', 'x'.repeat(1000)),
      ],
      maxPromptTokens: 10,
    });

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe('assistant');
    expect(result.debug.truncated).toBe(true);
    expect(result.debug.estimatedPromptTokens).toBeGreaterThan(result.debug.maxPromptTokens);
  });
});
