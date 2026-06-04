import { request } from '@umijs/max';
import type { BackendMessageListResponse } from '@/store/adapters/messageAdapter';

const BASE_URL = 'http://localhost:3001/api';

export interface FetchMessagesParams {
  cursor?: string | null;
  limit?: number;
}

export function fetchSessionMessages(
  sessionId: string,
  params?: FetchMessagesParams,
): Promise<BackendMessageListResponse> {
  return request(`${BASE_URL}/sessions/${sessionId}/messages`, {
    method: 'GET',
    params: {
      limit: params?.limit ?? 50,
      cursor: params?.cursor || undefined,
    },
  });
}
