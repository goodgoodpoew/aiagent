import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '@/store/types';
import { UserMessageContent } from './message-display';
import MessagePartsRenderer from './MessagePartsRenderer';

vi.mock('@ant-design/x-markdown', () => ({
  default: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div>,
}));

vi.mock('./message-display/MessageProcessPanel', () => ({
  default: () => (
    <div data-testid="answer-process">过程面板</div>
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

  it('渲染 v2 text parts、附件和处理过程面板', () => {
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

    expect(screen.getByTestId('answer-process')).toHaveTextContent('过程面板');
    expect(screen.getByText('测试文件.md')).toBeInTheDocument();
    expect(screen.getByText('结构化回答')).toBeInTheDocument();
  });

  it('渲染用户消息附件 metadata', () => {
    render(
      <UserMessageContent
        message={createAssistantMessage({
          role: 'user',
          content: '请结合附件回答',
          metadata: {
            attachments: [
              { fileId: 'file-1', name: '需求说明.pdf', type: 'application/pdf', size: 2048 },
            ],
          },
        })}
      />,
    );

    expect(screen.getByText('请结合附件回答')).toBeInTheDocument();
    expect(screen.getByText('需求说明.pdf')).toBeInTheDocument();
    expect(screen.getByText('2.0 KB')).toBeInTheDocument();
  });
});
