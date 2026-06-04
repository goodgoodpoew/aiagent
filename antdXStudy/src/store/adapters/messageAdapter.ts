import type { ChatMessage, ChatRole } from '../types';

export interface BackendMessageDto {
  id: string;
  sessionId: string;
  role: string;
  content: string;
  metadata?: Record<string, unknown> | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface BackendMessageListResponse {
  messages?: BackendMessageDto[];
  cursor?: string | null;
}

const allowedRoles = new Set<ChatRole>(['user', 'assistant', 'system']);

function normalizeRole(role: string): ChatRole {
  return allowedRoles.has(role as ChatRole) ? (role as ChatRole) : 'assistant';
}

function toIsoString(value: string | Date | undefined): string {
  if (!value) return new Date().toISOString();
  return value instanceof Date ? value.toISOString() : value;
}

export function normalizeMessage(dto: BackendMessageDto): ChatMessage {
  return {
    id: dto.id,
    sessionId: dto.sessionId,
    role: normalizeRole(dto.role),
    content: dto.content,
    metadata: dto.metadata ?? null,
    createdAt: toIsoString(dto.createdAt),
    updatedAt: dto.updatedAt ? toIsoString(dto.updatedAt) : undefined,
  };
}

export function normalizeMessageList(response: BackendMessageListResponse) {
  return {
    messages: (response.messages ?? []).map(normalizeMessage),
    cursor: response.cursor ?? null,
    hasMore: Boolean(response.cursor),
  };
}

export function createLocalMessage(params: {
  id: string;
  sessionId: string;
  role: ChatRole;
  content: string;
  metadata?: Record<string, unknown>;
}): ChatMessage {
  return {
    id: params.id,
    sessionId: params.sessionId,
    role: params.role,
    content: params.content,
    metadata: params.metadata ?? null,
    createdAt: new Date().toISOString(),
  };
}
