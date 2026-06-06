import {
  STREAM_PROTOCOL_V2,
  type ChatStreamRequestV2,
  type StreamEventEnvelope,
} from './stream-protocol';
import { getApiBaseUrl, getUserId } from './config';

export interface ChatStreamV2Handlers {
  onEvent: (event: StreamEventEnvelope) => void;
}

interface ParsedSseEvent {
  event?: string;
  data?: string;
}

// 浏览器拿到的是一段连续字节流，SSE 协议用空行分隔事件；
// 单个事件内部可能有 event/id/data 多行，这里只提取前端消费需要的 event 和 data。
export function parseSseEvent(rawEvent: string): ParsedSseEvent | undefined {
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
  // 这里不用 EventSource，因为主链路需要 POST JSON body 传递 input/runtime/context。
  // fetch 返回的 response.body 是 ReadableStream，可以一边读取一边把 SSE 事件交给 Redux。
  const response = await fetch(`${getApiBaseUrl()}/ai/chat/stream/v2`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': getUserId(),
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
    // TextDecoder 的 stream 选项会保留半个 UTF-8 字符，避免中文被 chunk 边界截断后解码乱码。
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

    // SSE 事件以空行分隔。最后一个片段可能还没收完整，放回 buffer 等下一次 reader.read() 拼接。
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';

    for (const rawEvent of events) {
      const parsedEvent = parseSseEvent(rawEvent);
      const data = parsedEvent?.data;
      if (!data || data === '[DONE]') continue;

      // v2 客户端只理解后端封装后的 StreamEventEnvelope，不再解析 provider 原始 chunk。
      // provider 的 delta/reasoning/tool_calls 已在后端适配器和 orchestrator 中转换为统一事件。
      const event = JSON.parse(data) as StreamEventEnvelope;
      if (event.protocol === STREAM_PROTOCOL_V2) {
        handlers.onEvent(event);
      }
    }

    if (done) break;
  }
}
