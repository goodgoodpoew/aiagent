import { IsString, IsOptional, IsObject } from 'class-validator';
import type { MessagePart } from '@/streaming/protocol/message-part.types';
import type { UsageUpdatedData } from '@/streaming/protocol/stream-event.types';

export const MESSAGE_PROTOCOL_V2 = 'aiagent.message.v2' as const;

export type MessageLifecycleStatus =
  | 'pending'
  | 'sending'
  | 'streaming'
  | 'done'
  | 'failed'
  | 'cancelled';

export type TokenUsage = UsageUpdatedData['usage'];

export interface MessageMetadataV2 {
  protocol?: typeof MESSAGE_PROTOCOL_V2;
  status?: MessageLifecycleStatus;
  parts?: MessagePart[];
  provider?: string;
  model?: string;
  usage?: TokenUsage;
  error?: unknown;
  requestId?: string;
  clientMessageId?: string;
  attachments?: unknown;
  unavailableAttachments?: unknown;
  [key: string]: unknown;
}

export class CreateMessageDto {
  @IsString()
  role!: string;

  @IsString()
  content!: string;

  @IsOptional()
  @IsObject()
  metadata?: MessageMetadataV2;
}
