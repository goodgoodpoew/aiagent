import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ant-design/x-markdown', () => ({
  default: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div>,
}));

// @ant-design/x 会传递引入 react-syntax-highlighter（ESM/CJS 冲突）。
// 组件视图测试用轻量替身渲染 Bubble.List 与 Sender，仍保留 role.contentRender 渲染链路。
vi.mock('@ant-design/x', () => {
  const List = ({ items, role }: any) => (
    <div data-testid="bubble-list">
      {items.map((item: any) => (
        <div key={item.key} data-loading={item.loading}>
          {role[item.role]?.contentRender?.(item.content)}
        </div>
      ))}
    </div>
  );
  const Sender = ({ value, loading, onChange, prefix }: any) => (
    <div>
      {prefix}
      <textarea role="textbox" value={value} disabled={loading} onChange={(e) => onChange?.(e.target.value)} />
    </div>
  );
  return { Bubble: { List }, Sender };
});

// 隔离视图层：thunk 副作用全部置为 no-op，组件测试只验证 store 状态到 UI 的渲染。
vi.mock('@/store/chatThunks', () => ({
  initializeChat: () => () => {},
  subscribeToSessionEvents: () => () => () => {},
  loadSessions: () => () => {},
  sendCurrentMessage: () => () => {},
  startNewChat: () => () => {},
  switchSession: () => () => {},
  deleteCurrentSession: () => () => {},
  ensureSessionForUploadedFiles: () => () => {},
}));
vi.mock('@/store/fileThunks', () => ({ loadSessionFiles: () => () => {} }));
vi.mock('@/service/file', () => ({ uploadFile: vi.fn() }));

import { contentReducer } from '@/store/contentStore';
import { fileReducer } from '@/store/fileStore';
import { messageReducer, appendMessage, applyStreamEvent } from '@/store/messageStore';
import { sessionReducer, setCurrentSessionId, upsertSession } from '@/store/sessionStore';
import { STREAM_PROTOCOL_V2 } from '@/service/stream-protocol';
import BaseLayout from './BaseLayout';

const now = '2026-06-06T00:00:00.000Z';

function createStore() {
  return configureStore({
    reducer: {
      sessions: sessionReducer,
      messages: messageReducer,
      content: contentReducer,
      files: fileReducer,
    },
  });
}

function renderWith(store: ReturnType<typeof createStore>) {
  return render(
    <Provider store={store}>
      <BaseLayout />
    </Provider>,
  );
}

describe('BaseLayout 聊天页视图', () => {
  it('空状态：无会话与无消息时给出引导', () => {
    renderWith(createStore());
    expect(screen.getByText('暂无会话')).toBeInTheDocument();
    expect(screen.getByText('在下方输入消息开始对话')).toBeInTheDocument();
  });

  it('渲染会话列表与当前会话消息', () => {
    const store = createStore();
    store.dispatch(upsertSession({ id: 's1', title: 'Playwright 会话', createdAt: now, updatedAt: now }));
    store.dispatch(setCurrentSessionId('s1'));
    store.dispatch(appendMessage({
      message: { id: 'u1', sessionId: 's1', role: 'user', content: '你好', metadata: null, createdAt: now },
      status: 'done',
    }));
    store.dispatch(appendMessage({
      message: { id: 'a1', sessionId: 's1', role: 'assistant', content: '这是回答', metadata: null, createdAt: now },
      status: 'done',
    }));

    renderWith(store);

    expect(screen.getAllByText('Playwright 会话').length).toBeGreaterThan(0);
    expect(screen.getByText('你好')).toBeInTheDocument();
    expect(screen.getByText('这是回答')).toBeInTheDocument();
  });

  it('流式进行中时发送框处于 loading（禁用发送）', () => {
    const store = createStore();
    store.dispatch(setCurrentSessionId('s1'));
    store.dispatch(appendMessage({
      message: { id: 'a1', sessionId: 's1', role: 'assistant', content: '', parts: [], metadata: null, createdAt: now },
      status: 'streaming',
    }));
    store.dispatch(applyStreamEvent({
      protocol: STREAM_PROTOCOL_V2,
      id: 'evt-1',
      type: 'message.part.started',
      traceId: 't',
      requestId: 'r',
      sessionId: 's1',
      messageId: 'a1',
      timestamp: now,
      sequence: 1,
      data: { part: { id: 'text-1', type: 'text', text: '', status: 'streaming' } },
    }));

    renderWith(store);

    expect(store.getState().messages.streamingMessageId).toBe('a1');
    // 思考开关在流式中禁用
    const reasoningSwitch = screen.getByRole('switch');
    expect(reasoningSwitch).toBeDisabled();
  });
});
