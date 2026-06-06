import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '@/store/types';
import MessagePartsRenderer from './MessagePartsRenderer';

vi.mock('@ant-design/x-markdown', () => ({
  default: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div>,
}));

vi.mock('./AnswerProcessPanel', () => ({
  default: ({ streaming }: { streaming: boolean }) => (
    <div data-testid="answer-process">{streaming ? '处理中' : '已完成'}</div>
  ),
}));

function createAssistantMessage(overrides?: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'assistant-1',
    sessionId: 'session-1',
    role: 'assistant',
    content: '',
    metadata: null,
    createdAt: '2026-06-06T00:00:00.000Z',
    ...overrides,
  };
}

describe('MessagePartsRenderer', () => {
  it('无 parts 时渲染旧消息正文', () => {
    render(<MessagePartsRenderer message={createAssistantMessage({ content: '旧消息正文' })} />);

    expect(screen.getByTestId('markdown')).toHaveTextContent('旧消息正文');
  });

  it('渲染 v2 text parts、附件和处理过程状态', () => {
    render(
      <MessagePartsRenderer
        message={createAssistantMessage({
          status: 'streaming',
          parts: [
            { id: 'trace-1', type: 'process_trace', traceType: 'thinking', title: '思考', status: 'running', visibility: 'summary' },
            { id: 'file-1', type: 'file', fileId: 'file-1', name: '测试文件.md' },
            { id: 'text-1', type: 'text', text: '结构化回答', status: 'streaming' },
          ],
        })}
      />,
    );

    expect(screen.getByTestId('answer-process')).toHaveTextContent('处理中');
    expect(screen.getByText('测试文件.md')).toBeInTheDocument();
    expect(screen.getByText('结构化回答')).toBeInTheDocument();
  });
});
