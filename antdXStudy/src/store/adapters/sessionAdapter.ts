import type { ChatSession } from '../types';

export interface BackendSessionDto {
  id: string;
  userId?: string;
  title?: string | null;
  titleStatus?: string;
  version?: number;
  isDeleted?: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface BackendSessionListResponse {
  sessions?: BackendSessionDto[];
  cursor?: string | null;
}

function toIsoString(value: string | Date | undefined): string {
  if (!value) return new Date().toISOString();
  return value instanceof Date ? value.toISOString() : value;
}

export function normalizeSession(dto: BackendSessionDto): ChatSession {
  // adapter 是后端 DTO 进入 Redux 的唯一入口，后端字段变化时优先在这里收敛差异。
  return {
    id: dto.id,
    userId: dto.userId,
    title: dto.title ?? null,
    titleStatus: dto.titleStatus,
    version: dto.version,
    isDeleted: dto.isDeleted ?? false,
    createdAt: toIsoString(dto.createdAt),
    updatedAt: toIsoString(dto.updatedAt),
  };
}

export function normalizeSessionList(response: BackendSessionListResponse) {
  return {
    sessions: (response.sessions ?? []).map(normalizeSession),
    cursor: response.cursor ?? null,
    hasMore: Boolean(response.cursor),
  };
}
