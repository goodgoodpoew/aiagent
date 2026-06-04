import { Bubble, Sender } from '@ant-design/x';
import { useXChat, XRequest, type XRequestOptions } from '@ant-design/x-sdk';
import { Card } from 'antd';
import { useMemo, useState } from 'react';
import {
  type ChatInput,
  type ChatOutput,
  createChartBubbleRole,
  createChatInput,
  StreamChatProvider,
  toChatBubbleItems,
} from '@/service/chat-shared';
import XMarkdown from '@ant-design/x-markdown';

/** 模拟流式 SSE，无需真实 API Key */
function createMockFetch() {
  return async (
    _url: Parameters<typeof fetch>[0],
    options: XRequestOptions<ChatInput, ChatOutput>,
  ) => {
    const params = (options.params || {}) as ChatInput;
    const query = params.query || '';
    const reply = `收到你的消息：「${query}」。这是 @ant-design/x-sdk 的 useXChat + StreamChatProvider 模拟流式回复。`;

    const encoder = new TextEncoder();
    let index = 0;

    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (index >= reply.length) {
          controller.close();
          return;
        }
        const slice = reply.slice(0, index + 2);
        index += 2;
        const payload: ChatOutput = {
          choices: [{ message: { content: slice, role: 'assistant' } }],
        };
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
        );
      },
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
    });
  };
}

export default function SdkPage() {
  const [input, setInput] = useState('');

  const provider = useMemo(
    () =>
      new StreamChatProvider({
        request: XRequest<ChatInput, ChatOutput>('/mock-chat', {
          manual: true,
          fetch: createMockFetch(),
        }),
      }),
    [],
  );

  const { onRequest, messages, isRequesting } = useXChat({
    provider,
  });

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <Card title="X SDK - useXChat 数据流" style={{ marginBottom: 24 }}>
        <div style={{ minHeight: 360, marginBottom: 16 }}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', color: '#999', paddingTop: 140 }}>
              使用 @ant-design/x-sdk 管理对话数据，在下方输入消息开始
            </div>
          )}
          <Bubble.List
            role={createChartBubbleRole((text) => {
              return <XMarkdown>{text}</XMarkdown>;
            })}
            items={toChatBubbleItems(messages)}
          />
        </div>
        <Sender
          loading={isRequesting}
          value={input}
          onChange={setInput}
          onSubmit={(val) => {
            onRequest(createChatInput(val));
            setInput('');
          }}
        />
      </Card>
    </div>
  );
}
