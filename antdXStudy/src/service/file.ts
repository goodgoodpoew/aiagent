import { request } from '@umijs/max';
import type { BackendFileListResponse } from '@/store/adapters/fileAdapter';

const BASE_URL = 'http://localhost:3001/api';

export interface FetchFilesParams {
  cursor?: string | null;
  limit?: number;
  purpose?: string;
  status?: string;
  sessionId?: string;
}

export function fetchFiles(params?: FetchFilesParams): Promise<BackendFileListResponse> {
  return request(`${BASE_URL}/files`, {
    method: 'GET',
    params: {
      limit: params?.limit ?? 20,
      cursor: params?.cursor || undefined,
      purpose: params?.purpose || undefined,
      status: params?.status || undefined,
      sessionId: params?.sessionId || undefined,
    },
  });
}

export function fetchSessionFiles(
  sessionId: string,
  params?: Pick<FetchFilesParams, 'cursor' | 'limit'>,
): Promise<BackendFileListResponse> {
  return request(`${BASE_URL}/sessions/${sessionId}/files`, {
    method: 'GET',
    params: {
      limit: params?.limit ?? 50,
      cursor: params?.cursor || undefined,
    },
  });
}

export function deleteFile(id: string): Promise<void> {
  return request(`${BASE_URL}/files/${id}`, {
    method: 'DELETE',
  });
}

export function getFileDownloadUrl(id: string) {
  return `${BASE_URL}/files/${id}/download`;
}
