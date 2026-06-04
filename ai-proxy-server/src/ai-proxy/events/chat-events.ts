export const CHAT_EVENTS = {
  STREAM_START: 'chat.stream.start',
  STREAM_COMPLETE: 'chat.stream.complete',
  STREAM_ERROR: 'chat.stream.error',
} as const;

export interface StreamStartPayload {
  sessionId: string;
  userMessageId: string;
  assistantMessageId: string;
  userId: string;
  query: string;
  platform: string;
  model: string;
  isNewSession: boolean;
}

export interface StreamCompletePayload {
  sessionId: string;
  messageId: string;
  content: string;
}

export interface StreamErrorPayload {
  sessionId: string;
  messageId: string;
  code: string;
  error: string;
  content: string;
  metadata: Record<string, unknown>;
}
