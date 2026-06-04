const BASE_URL = 'http://localhost:3001/api';
const USER_ID = '9a74c501-9d60-441b-b1ba-7b3eb469dce0';
const MAX_RETRY_DELAY = 5000;
const LAST_EVENT_ID_KEY = 'sessionEvents.lastEventId';

export interface SessionTitleUpdatedEvent {
  sessionId: string;
  title: string | null;
  titleStatus?: string;
  updatedAt: string;
  version?: number;
}

export interface SessionCreatedEvent {
  sessionId: string;
  title?: string | null;
  titleStatus?: string;
  createdAt: string;
  updatedAt: string;
  version?: number;
}

export interface MessageCompletedEvent {
  sessionId: string;
  messageId: string;
  status: string;
  updatedAt: string;
  version?: number;
}

export interface SessionEventHandlers {
  onSessionCreated?: (payload: SessionCreatedEvent) => void;
  onTitleUpdated: (payload: SessionTitleUpdatedEvent) => void;
  onMessageCompleted?: (payload: MessageCompletedEvent) => void;
  onUnknownEvent?: () => void;
  onError?: (error: unknown) => void;
}

interface ParsedSseEvent {
  id?: string;
  event?: string;
  data?: string;
}

function parseSseEvent(rawEvent: string): ParsedSseEvent | undefined {
  const event: ParsedSseEvent = {};
  const dataLines: string[] = [];

  rawEvent.split('\n').forEach((line) => {
    if (line.startsWith('id: ')) {
      event.id = line.slice(4).trim();
      return;
    }
    if (line.startsWith('event: ')) {
      event.event = line.slice(7).trim();
      return;
    }
    if (line.startsWith('data: ')) {
      dataLines.push(line.slice(6));
    }
  });

  if (dataLines.length) {
    event.data = dataLines.join('\n').trim();
  }

  return event.event || event.data ? event : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function saveLastEventId(id?: string) {
  if (!id) return;
  localStorage.setItem(LAST_EVENT_ID_KEY, id);
}

function getLastEventId() {
  return localStorage.getItem(LAST_EVENT_ID_KEY) || undefined;
}

export function subscribeSessionEvents(handlers: SessionEventHandlers): () => void {
  let stopped = false;
  let retryDelay = 1000;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;

  const scheduleReconnect = () => {
    if (stopped) return;

    reconnectTimer = setTimeout(() => {
      void connect();
    }, retryDelay);
    retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY);
  };

  const handleEvent = (rawEvent: string) => {
    const event = parseSseEvent(rawEvent);
    if (!event?.event || !event.data) return;

    saveLastEventId(event.id);

    const payload = JSON.parse(event.data) as unknown;
    if (!isObject(payload)) return;

    if (event.event === 'session.created') {
      handlers.onSessionCreated?.(payload as unknown as SessionCreatedEvent);
      return;
    }

    if (event.event === 'session.title.updated') {
      handlers.onTitleUpdated(payload as unknown as SessionTitleUpdatedEvent);
      return;
    }

    if (event.event === 'message.completed') {
      handlers.onMessageCompleted?.(payload as unknown as MessageCompletedEvent);
      return;
    }

    handlers.onUnknownEvent?.();
  };

  const connect = async () => {
    controller = new AbortController();

    try {
      const lastEventId = getLastEventId();
      const response = await fetch(`${BASE_URL}/sessions/events`, {
        headers: {
          'X-User-Id': USER_ID,
          ...(lastEventId ? { 'Last-Event-ID': lastEventId } : {}),
        },
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`会话事件连接失败：${response.status}`);
      }

      retryDelay = 1000;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (!stopped) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';

        events.forEach((event) => {
          handleEvent(event);
        });

        if (done) break;
      }
    } catch (error) {
      // #region agent log
      fetch('http://127.0.0.1:7714/ingest/4f43500c-5ac0-4e7a-a0af-59ca55c3dae3',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'555fd6'},body:JSON.stringify({sessionId:'555fd6',location:'session-events.ts:161',message:'SSE连接错误',data:{error:error instanceof Error?error.message:String(error),stopped,lastEventId:getLastEventId()},timestamp:Date.now(),runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      if (!stopped && !(error instanceof DOMException && error.name === 'AbortError')) {
        handlers.onError?.(error);
      }
    }

    scheduleReconnect();
  };

  void connect();

  return () => {
    stopped = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
    }
    controller?.abort();
  };
}
