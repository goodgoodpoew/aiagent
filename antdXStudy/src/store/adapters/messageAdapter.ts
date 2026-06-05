import type { ChatMessage, ChatRole, MessageRuntimeStatus } from '../types';
import type { MessagePart, StreamMessageSnapshot } from '@/service/stream-protocol';

export interface BackendMessageDto {
  id: string;
  sessionId: string;
  role: string;
  content: string;
  metadata?: Record<string, unknown> | null;
  parts?: MessagePart[];
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

function readMetadataParts(metadata: Record<string, unknown> | null | undefined) {
  const parts = metadata?.parts;
  return Array.isArray(parts) ? (parts as MessagePart[]) : undefined;
}

function createTextPartFromContent(dto: Pick<BackendMessageDto, 'id' | 'content'>): MessagePart[] {
  return [
    {
      id: `${dto.id}:text:0`,
      type: 'text',
      text: dto.content,
      status: 'done',
    },
  ];
}

function readMetadataStatus(metadata: Record<string, unknown> | null | undefined): MessageRuntimeStatus | undefined {
  const status = metadata?.status;
  return toRuntimeStatus(status);
}

function toRuntimeStatus(status: unknown): MessageRuntimeStatus | undefined {
  if (status === 'done') return 'done';
  if (status === 'streaming') return 'streaming';
  if (status === 'sending' || status === 'pending') return 'sending';
  if (status === 'failed' || status === 'cancelled' || status === 'error') return 'failed';
  return undefined;
}

export function normalizeMessage(dto: BackendMessageDto): ChatMessage {
  const metadata = dto.metadata ?? null;
  const parts = dto.parts ?? readMetadataParts(metadata) ?? createTextPartFromContent(dto);
  const status = readMetadataStatus(metadata);

  return {
    id: dto.id,
    sessionId: dto.sessionId,
    role: normalizeRole(dto.role),
    content: dto.content,
    // 后端把 v2 parts 持久化在 metadata.parts；旧消息没有 parts 时补一个 text part 保证渲染入口统一。
    parts,
    status,
    metadata,
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
  parts?: MessagePart[];
  metadata?: Record<string, unknown>;
}): ChatMessage {
  return {
    id: params.id,
    sessionId: params.sessionId,
    role: params.role,
    content: params.content,
    parts: params.parts,
    status: undefined,
    metadata: params.metadata ?? null,
    createdAt: new Date().toISOString(),
  };
}

export function normalizeStreamMessage(
  snapshot: StreamMessageSnapshot,
  sessionId: string,
  fallback?: ChatMessage,
): ChatMessage {
  // 流式消息的 parts 由 message.part.started/delta 事件渐进填充，不当创建合成 text part
  // 占用 index 0，避免后续 file_read / reasoning 被 push 到 text 之后。
  return {
    id: snapshot.id,
    sessionId,
    role: normalizeRole(snapshot.role),
    content: snapshot.content,
    parts: snapshot.parts,
    status: readMetadataStatus(snapshot.metadata) ?? toRuntimeStatus(snapshot.status),
    metadata: snapshot.metadata ?? fallback?.metadata ?? null,
    createdAt: snapshot.createdAt ? toIsoString(snapshot.createdAt) : fallback?.createdAt ?? new Date().toISOString(),
    updatedAt: snapshot.updatedAt ? toIsoString(snapshot.updatedAt) : fallback?.updatedAt,
  };
}

export function getMessageTextProjection(message: ChatMessage) {
  const text = message.parts
    ?.filter((part): part is Extract<MessagePart, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('');

  return text || message.content;
}
