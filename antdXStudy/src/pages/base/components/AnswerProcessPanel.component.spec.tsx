import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MessagePart } from '@/service/stream-protocol';
import AnswerProcessPanel from './AnswerProcessPanel';

vi.mock('@ant-design/x-markdown', () => ({
  default: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div>,
}));

function renderPanel(parts: MessagePart[]) {
  render(<AnswerProcessPanel parts={parts} />);
}

describe('AnswerProcessPanel', () => {
  it('只剩正文流式输出时，已完成的 reasoning 不再让过程面板显示进行中', () => {
    renderPanel([
      {
        id: 'reasoning-1',
        type: 'reasoning',
        visibility: 'summary',
        status: 'done',
        summary: '思考已经完成',
      },
      {
        id: 'text-1',
        type: 'text',
        status: 'streaming',
        text: '正式回答正在继续输出',
      },
    ]);

    const header = screen.getByText('回答过程').closest('.ant-collapse-header');
    expect(header).not.toBeNull();
    expect(within(header as HTMLElement).getByText('已完成')).toBeInTheDocument();
    expect(screen.queryByText('进行中')).not.toBeInTheDocument();
  });

  it('reasoning 长文本展示短摘要，查看详情保留完整内容', () => {
    const longReasoning = Array.from({ length: 3 }, () => [
      '第一步先确认用户真正想要解决的问题，并把它拆成状态和内容两个维度。',
      '第二步检查前端渲染入口，发现过程面板顶部状态来自整条消息的 streaming。',
      '第三步检查后端收口事件，确认最终快照会把 reasoning 标记为 done。',
      '第四步把摘要改成短预览，详情继续展示完整的可见思考内容。',
    ].join('\n\n')).join('\n\n');

    renderPanel([
      {
        id: 'reasoning-1',
        type: 'reasoning',
        visibility: 'summary',
        status: 'done',
        summary: longReasoning,
      },
    ]);

    fireEvent.click(screen.getByText('回答过程'));

    expect(screen.getByText(/第一步先确认用户真正想要解决的问题/)).toHaveTextContent('...');
    expect(screen.getByText('查看详情')).toBeInTheDocument();
    fireEvent.click(screen.getByText('查看详情'));
    expect(screen.getByTestId('markdown')).toHaveTextContent(longReasoning.replace(/\s+/g, ' '));
  });

  it('reasoning 短文本不展示重复的查看详情入口', () => {
    renderPanel([
      {
        id: 'reasoning-1',
        type: 'reasoning',
        visibility: 'summary',
        status: 'done',
        summary: '短思考摘要',
      },
    ]);

    fireEvent.click(screen.getByText('回答过程'));

    expect(screen.getByText('短思考摘要')).toBeInTheDocument();
    expect(screen.queryByText('查看详情')).not.toBeInTheDocument();
  });
});
