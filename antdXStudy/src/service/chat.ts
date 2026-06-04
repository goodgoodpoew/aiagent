import type { ChatStreamChunk, SendChatPayload } from '@/store/types';
import { parseApiEnvelopeResponse } from './request';

const BASE_URL = 'http://localhost:3001/api';
const USER_ID = '9a74c501-9d60-441b-b1ba-7b3eb469dce0';

export interface ChatStreamHandlers {
  onSessionId?: (sessionId: string) => void;
  onSessionCreated?: (payload: {
    sessionId: string;
    title?: string | null;
    titleStatus?: string;
    createdAt?: string;
    updatedAt?: string;
    version?: number;
  }) => void;
  onMessageCreated?: (payload: {
    sessionId: string;
    userMessageId: string;
    assistantMessageId: string;
    clientMessageId?: string;
    requestId?: string;
  }) => void;
  onDelta?: (delta: string, chunk: ChatStreamChunk) => void;
  onErrorChunk?: (message: string, chunk: ChatStreamChunk) => void;
  onDone?: () => void;
}

interface ParsedSseEvent {
  event?: string;
  data?: string;
}

function parseSseEvent(event: string): ParsedSseEvent | undefined {
  const parsed: ParsedSseEvent = {};
  const dataLines: string[] = [];

  event.split('\n').forEach((line) => {
    if (line.startsWith('event: ')) {
      parsed.event = line.slice(7).trim();
      return;
    }
    if (line.startsWith('data: ')) {
      dataLines.push(line.slice(6));
    }
  });

  if (dataLines.length) {
    parsed.data = dataLines.join('\n').trim();
  }

  return parsed.event || parsed.data ? parsed : undefined;
}

export async function sendChatStream(payload: SendChatPayload, handlers: ChatStreamHandlers) {
  const body: Record<string, unknown> = {
    query: payload.query,
    sessionId: payload.sessionId || undefined,
    provider: payload.provider || undefined,
    model: payload.model || undefined,
    requestId: payload.requestId,
    clientMessageId: payload.clientMessageId,
    credentialId: payload.credentialId || undefined,
    temperature: payload.temperature,
    max_tokens: payload.max_tokens,
    stream: payload.stream,
    autoGenerateSessionName: payload.autoGenerateSessionName ?? true,
  };

  if (payload.fileIds?.length) {
    body.fileIds = payload.fileIds;
  }

  const response = await fetch(`${BASE_URL}/ai/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': USER_ID,
    },
    body: JSON.stringify(body),
  });

  const headerSessionId = response.headers.get('X-Session-Id');
  if (headerSessionId) {
    handlers.onSessionId?.(headerSessionId);
  }

  if (!response.ok || !response.body) {
    throw new Error(`请求失败：${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';

    for (const event of events) {
      const parsedEvent = parseSseEvent(event);
      const data = parsedEvent?.data;
      if (!data) continue;
      if (data === '[DONE]' || parsedEvent.event === 'done') {
        handlers.onDone?.();
        continue;
      }

      const chunk = JSON.parse(data) as ChatStreamChunk;

      if (parsedEvent.event === 'session.created') {
        const payload = chunk as unknown as Parameters<NonNullable<ChatStreamHandlers['onSessionCreated']>>[0];
        handlers.onSessionCreated?.(payload);
        if (payload.sessionId) {
          handlers.onSessionId?.(payload.sessionId);
        }
        continue;
      }

      if (parsedEvent.event === 'message.created') {
        const payload = chunk as unknown as Parameters<NonNullable<ChatStreamHandlers['onMessageCreated']>>[0];
        handlers.onMessageCreated?.(payload);
        if (payload.sessionId) {
          handlers.onSessionId?.(payload.sessionId);
        }
        continue;
      }

      if (parsedEvent.event === 'error') {
        const errorPayload = chunk as unknown as { message?: string; code?: string };
        handlers.onErrorChunk?.(errorPayload.message || '请求失败，请稍后重试', {
          status: 'error',
          errorCode: errorPayload.code,
          choices: [{ message: { content: errorPayload.message || '', role: 'assistant' } }],
        });
        continue;
      }

      const choice = chunk.choices?.[0];
      const sessionId = chunk.sessionId || choice?.sessionId;
      const text = chunk.delta ?? choice?.message?.content ?? '';

      if (sessionId) {
        handlers.onSessionId?.(sessionId);
      }

      if (chunk.status === 'error') {
        handlers.onErrorChunk?.(text || '请求失败，请稍后重试', chunk);
        continue;
      }

      if (text) {
        handlers.onDelta?.(text, chunk);
      }
    }

    if (done) break;
  }
}

/**
 * 上传单个文件
 */
export async function uploadFile(file: File): Promise<{
  id: string;
  name: string;
  type: string;
  size: number;
  status: string;
  url?: string;
  createdAt: string;
}> {
  const formData = new FormData();
  formData.append('displayName', file.name);
  formData.append('purpose', 'chat');
  formData.append('file', file);

  const response = await fetch(`${BASE_URL}/files/upload`, {
    method: 'POST',
    headers: {
      'X-User-Id': USER_ID,
      'X-File-Name': encodeURIComponent(file.name),
    },
    body: formData,
  });

  return parseApiEnvelopeResponse(response, '上传失败');
}
