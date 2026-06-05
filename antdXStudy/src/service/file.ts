import { request } from '@umijs/max';
import { parseApiEnvelopeResponse } from './request';
import type { BackendFileListResponse } from '@/store/adapters/fileAdapter';

const BASE_URL = 'http://localhost:3001/api';
const USER_ID = '9a74c501-9d60-441b-b1ba-7b3eb469dce0';

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

/**
 * 主聊天页文件上传入口。
 * 文件上传与 v2 流式聊天请求解耦，发送消息时只传递文件 ID。
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
