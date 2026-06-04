import type { ChatFile } from '../types';

export interface BackendFileDto {
  id: string;
  name: string;
  type: string;
  extension?: string;
  size: number;
  status: string;
  purpose: string;
  url?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  sessionCount?: number;
  messageCount?: number;
}

export interface BackendFileListResponse {
  files?: BackendFileDto[];
  cursor?: string | null;
}

function toIsoString(value: string | Date | undefined): string {
  if (!value) return new Date().toISOString();
  return value instanceof Date ? value.toISOString() : value;
}

export function normalizeFile(dto: BackendFileDto): ChatFile {
  return {
    id: dto.id,
    name: dto.name,
    type: dto.type,
    extension: dto.extension,
    size: Number(dto.size),
    status: dto.status,
    purpose: dto.purpose,
    url: dto.url,
    createdAt: toIsoString(dto.createdAt),
    updatedAt: toIsoString(dto.updatedAt),
    sessionCount: dto.sessionCount ?? 0,
    messageCount: dto.messageCount ?? 0,
  };
}

export function normalizeFileList(response: BackendFileListResponse) {
  return {
    files: (response.files ?? []).map(normalizeFile),
    cursor: response.cursor ?? null,
    hasMore: Boolean(response.cursor),
  };
}
