import type { BubbleListProps } from '@ant-design/x';
import { Alert, message } from 'antd';
import { request } from "@umijs/max";
import {
  DefaultChatProvider,
  XRequest,
  type AbstractXRequestClass,
  type SSEOutput,
  type TransformMessage,
  type XRequestOptions,
} from '@ant-design/x-sdk';
import type { MessageInfo } from '@ant-design/x-sdk';
import React from 'react';

/**
 * Ant Design X 示例兼容层。
 * 本文件随示例页放置，只服务 /chat、/sdk 等学习示例，继续适配 v1 choices SSE；
 * /ai/chat 主业务请使用 chat-stream-v2.ts 和 stream-protocol.ts。
 */

/** 用户发送参数 */
export interface ChatInput {
  query: string;
  stream: boolean;
  sessionId?: string;
  role: 'user';
}

/** 后端 / 代理 SSE 返回格式 */
export interface ChatOutput {
  status?: string;
  errorCode?: string;
  choices: Array<{
    message: {
      content: string;
      role: string;
    };
    sessionId?: string;
  }>;
}

export type ChatMessageType = ChatInput | ChatOutput;
export const BASE_URL = 'http://localhost:3001/api';

export const CHAT_STREAM_API = `${BASE_URL}/ai/chat/stream`;
// function renderAssistantError(content: ChatOutput): React.ReactNode {
//   const text = content?.choices?.[0]?.message?.content || '抱歉，回复生成失败，请重试。';
//   const code = content.errorCode;
//   return (
//     <Alert
//       type="error"
//       showIcon
//       message={text}
//       description={code ? `错误码：${code}` : undefined}
//     />
//   );
// }

export const createChartBubbleRole: (cb: (text: string) => React.ReactNode) => BubbleListProps['role'] = (cb) => {
  const chatBubbleRole: BubbleListProps['role'] = {
    assistant: {
      placement: 'start',
      contentRender: (content: ChatOutput) => {
        const text = content?.choices?.[0]?.message?.content || '';
        const cacheSessionId = localStorage.getItem('sessionId');
        const resultSessionId = content?.choices?.[0]?.sessionId || '';
        if ((cacheSessionId !== resultSessionId) && resultSessionId) {
          localStorage.setItem('sessionId', resultSessionId);
        }
        if (content.status === 'error') {
          return text;
        }
        return cb(text);
      },
    },
    user: {
      placement: 'end',
      contentRender: (content: ChatInput) => content.query,
    },
  };
  return chatBubbleRole;
};

export const getMessageList = async (sessionId?: string) => {
  const ressId = sessionId || localStorage.getItem("sessionId");
  if (!ressId) return [];
  const res = await request(`${BASE_URL}/sessions/${ressId}/messages`);
  return res.messages || [];
}

/** 构造用户消息请求体 */
export function createChatInput(query: string): ChatInput {
  const sessionId = localStorage.getItem('sessionId') || "";
  return { query, stream: true, role: 'user', sessionId };
}

/** 从消息中解析 Bubble 角色 */
export function getChatMessageRole(message: ChatMessageType): string {
  if ((message as ChatInput).role) {
    return (message as ChatInput).role;
  }
  return (message as ChatOutput)?.choices?.[0]?.message?.role ?? 'assistant';
}

/** useXChat messages → Bubble.List items */
export function toChatBubbleItems(
  messages: MessageInfo<ChatMessageType>[],
): BubbleListProps['items'] {
  // console.log(messages, "messages");

  return messages.map(({ id, message, status }) => {
    return {
      key: id,
      loading: status === 'loading',
      content: message,
      role: getChatMessageRole(message),
    }
  });
}

/** SSE chunk: { data: '{"choices":[...]}' } → ChatOutput */
export function parseSseData(data: string | undefined): ChatOutput | undefined {
  if (!data || data.trim() === '[DONE]') {
    return undefined;
  }
  try {
    return JSON.parse(data) as ChatOutput;
  } catch {
    return undefined;
  }
}

/** 将 XRequest 的 SSEOutput 转为后端约定的 ChatOutput */
export class StreamChatProvider extends DefaultChatProvider<
  ChatMessageType,
  ChatInput,
  ChatOutput
> {
  transformMessage(
    info: TransformMessage<ChatMessageType, ChatOutput>,
  ): ChatMessageType {
    const { chunk, chunks, originMessage, responseHeaders } = info;
    const isSse = responseHeaders
      ?.get('content-type')
      ?.includes('text/event-stream');

    if (isSse && chunk) {
      const parsed = parseSseData((chunk as SSEOutput).data);
      if (!parsed?.choices?.length) {
        return (originMessage as ChatMessageType) ?? chunk;
      }

      const origin = originMessage as ChatOutput | undefined;
      const prevContent = origin?.choices?.[0]?.message?.content ?? '';
      const delta = parsed.choices?.[0]?.message?.content ?? '';
      const mergedContent = prevContent + delta;
      const choice0 = parsed.choices[0];

      const merged: ChatOutput = {
        ...parsed,
        choices: [
          {
            ...choice0,
            message: {
              ...choice0.message,
              content: mergedContent,
              role: choice0.message?.role ?? origin?.choices?.[0]?.message?.role ?? 'assistant',
            },
            sessionId: choice0.sessionId ?? origin?.choices?.[0]?.sessionId,
          },
        ],
      };

      return merged;
    }


    return super.transformMessage(info) as ChatMessageType;
  }
}

export interface CreateStreamChatProviderOptions
  extends Omit<XRequestOptions<ChatInput, ChatOutput>, 'manual'> {
  manual?: boolean;
}

/** 创建流式聊天 Provider（默认 SSE 分隔符 \n\n） */
export function createStreamChatProvider(
  baseURL: string,
  options?: CreateStreamChatProviderOptions,
): StreamChatProvider {
  const { manual = true, streamSeparator = '\n\n', ...rest } = options ?? {};
  return new StreamChatProvider({
    request: XRequest<ChatInput, ChatOutput>(baseURL, {
      manual,
      streamSeparator,
      headers: {
        "X-User-Id": "9a74c501-9d60-441b-b1ba-7b3eb469dce0",
      },
      callbacks: {
        onSuccess(chunks, responseHeaders, chatMessage) {

        },
        onError(error, errorInfo, responseHeaders, fallbackMsg) {
          console.error(error, errorInfo, responseHeaders, fallbackMsg);
          message.error(
            typeof fallbackMsg === 'string' && fallbackMsg
              ? fallbackMsg
              : '请求失败，请稍后重试',
          );
        },
      },
      ...rest,
    }),
  });
}

export type StreamChatRequest = AbstractXRequestClass<ChatInput, ChatOutput>;
