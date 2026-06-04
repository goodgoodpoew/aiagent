import { Bubble, Sender } from '@ant-design/x';
import { useXChat } from '@ant-design/x-sdk';
import { Card } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import {
  CHAT_STREAM_API,
  createChartBubbleRole,
  createChatInput,
  getMessageList,
  createStreamChatProvider,
  toChatBubbleItems,
} from '@/service/chat-shared';
import XMarkdown from '@ant-design/x-markdown';

export default function ChatPage() {
  const [input, setInput] = useState('');

  const provider = useMemo(
    () => createStreamChatProvider(CHAT_STREAM_API),
    [],
  );

  const { onRequest, setMessages, messages, isRequesting } = useXChat({
    provider,
  });

  const role = useMemo(() => createChartBubbleRole((text) => {
    return <XMarkdown>{text}</XMarkdown>;
  }), []);
  useEffect(() => {
    getMessageList().then((res) => {
      const msList = (res || [])?.map((item: any) => {
        let message = item;
        if (item.role === "assistant") {
          const isFailed = item.metadata?.status === 'failed';
          message = {
            choices: [
              {
                message: {
                  content: item.content,
                  role: "assistant",
                },
                sessionId: item.sessionId,
              },
            ],
            status: isFailed ? 'error' : 'done',
            errorCode: isFailed ? item.metadata?.code : undefined,
          };
        }
        if (item.role === "user") {
          message = {
            ...item,
            query: item.content,
            stream: false,
            status: "done",
          };
        }
        return {
          id: item.id,
          message: message,
          type: "done"
        }
      });
      setMessages(msList);
    });
  }, [setMessages]);

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <Card title="Chat 聊天 - useXChat (X SDK)" style={{ marginBottom: 24 }}>
        <div style={{ minHeight: 400, maxHeight: '80vh', overflowY: 'auto', marginBottom: 16 }}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', color: '#999', paddingTop: 160 }}>
              在下方输入消息开始对话
            </div>
          )}
          <Bubble.List
            role={role}
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
