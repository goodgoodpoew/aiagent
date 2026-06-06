import { request } from '@umijs/max';
import type { BackendMessageListResponse } from '@/store/adapters/messageAdapter';
import { getApiBaseUrl } from './config';

const sessionsUrl = () => `${getApiBaseUrl()}/sessions`;

export interface FetchMessagesParams {
  cursor?: string | null;
  limit?: number;
}

export function fetchSessionMessages(
  sessionId: string,
  params?: FetchMessagesParams,
): Promise<BackendMessageListResponse> {
  return request(`${sessionsUrl()}/${sessionId}/messages`, {
    method: 'GET',
    params: {
      limit: params?.limit ?? 50,
      cursor: params?.cursor || undefined,
    },
  });
}
