import { request } from '@umijs/max';
import type { BackendSessionDto, BackendSessionListResponse } from '@/store/adapters/sessionAdapter';

const BASE_URL = 'http://localhost:3001/api';

export interface FetchSessionsParams {
  cursor?: string | null;
  limit?: number;
}

export function fetchSessions(params?: FetchSessionsParams): Promise<BackendSessionListResponse> {
  return request(`${BASE_URL}/sessions`, {
    method: 'GET',
    params: {
      limit: params?.limit ?? 20,
      cursor: params?.cursor || undefined,
    },
  });
}

export function createSession(data: { title?: string; fileIds?: string[] }): Promise<BackendSessionDto> {
  return request(`${BASE_URL}/sessions`, {
    method: 'POST',
    data,
  });
}

export function attachFilesToSession(id: string, fileIds: string[]): Promise<{ attachedFileIds: string[] }> {
  return request(`${BASE_URL}/sessions/${id}/files`, {
    method: 'POST',
    data: { fileIds },
  });
}

export function updateSession(id: string, data: { title?: string }): Promise<BackendSessionDto> {
  return request(`${BASE_URL}/sessions/${id}`, {
    method: 'PATCH',
    data,
  });
}

export function deleteSession(id: string): Promise<BackendSessionDto> {
  return request(`${BASE_URL}/sessions/${id}`, {
    method: 'DELETE',
  });
}
