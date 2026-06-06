import { request } from '@umijs/max';
import { parseApiEnvelopeResponse } from './request';
import type { BackendFileListResponse } from '@/store/adapters/fileAdapter';
import { buildAuthHeaders, getApiBaseUrl } from './config';

const filesUrl = () => `${getApiBaseUrl()}/files`;
const sessionsUrl = () => `${getApiBaseUrl()}/sessions`;

export interface FetchFilesParams {
  cursor?: string | null;
  limit?: number;
  purpose?: string;
  status?: string;
  sessionId?: string;
}

export function fetchFiles(
  params?: FetchFilesParams,
): Promise<BackendFileListResponse> {
  return request(filesUrl(), {
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
  return request(`${sessionsUrl()}/${sessionId}/files`, {
    method: 'GET',
    params: {
      limit: params?.limit ?? 50,
      cursor: params?.cursor || undefined,
    },
  });
}

export function deleteFile(id: string): Promise<void> {
  return request(`${filesUrl()}/${id}`, {
    method: 'DELETE',
  });
}

export function getFileDownloadUrl(id: string) {
  return `${filesUrl()}/${id}/download`;
}

export async function downloadFile(id: string) {
  const response = await fetch(getFileDownloadUrl(id), {
    headers: buildAuthHeaders(),
  });

  if (!response.ok) {
    await parseApiEnvelopeResponse(response, '下载失败');
  }

  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') || '';
  const matched = disposition.match(/filename="([^"]+)"/);
  const fileName = matched ? decodeURIComponent(matched[1]) : 'download';
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
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

  const response = await fetch(`${filesUrl()}/upload`, {
    method: 'POST',
    headers: {
      ...buildAuthHeaders(),
      'X-File-Name': encodeURIComponent(file.name),
    },
    body: formData,
  });

  return parseApiEnvelopeResponse(response, '上传失败');
}
