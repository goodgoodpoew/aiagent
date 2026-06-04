import {
  STREAM_PROTOCOL_V2,
  type ChatStreamRequestV2,
  type StreamEventEnvelope,
} from './stream-protocol';

const BASE_URL = 'http://localhost:3001/api';
const USER_ID = '9a74c501-9d60-441b-b1ba-7b3eb469dce0';

export interface ChatStreamV2Handlers {
  onEvent: (event: StreamEventEnvelope) => void;
}

interface ParsedSseEvent {
  event?: string;
  data?: string;
}

function parseSseEvent(rawEvent: string): ParsedSseEvent | undefined {
  const parsed: ParsedSseEvent = {};
  const dataLines: string[] = [];

  rawEvent.split('\n').forEach((line) => {
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

export async function sendChatStreamV2(
  payload: ChatStreamRequestV2,
  handlers: ChatStreamV2Handlers,
) {
  const response = await fetch(`${BASE_URL}/ai/chat/stream/v2`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': USER_ID,
    },
    body: JSON.stringify({
      ...payload,
      protocol: STREAM_PROTOCOL_V2,
    }),
  });

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

    for (const rawEvent of events) {
      const parsedEvent = parseSseEvent(rawEvent);
      const data = parsedEvent?.data;
      if (!data || data === '[DONE]') continue;

      // v2 客户端只理解标准 StreamEventEnvelope，不再解析 provider 原始 chunk。
      const event = JSON.parse(data) as StreamEventEnvelope;
      if (event.protocol === STREAM_PROTOCOL_V2) {
        handlers.onEvent(event);
      }
    }

    if (done) break;
  }
}
