import type { StreamProtocolV2 } from '../protocol/stream-event.types';
import type { ToolDefinitionRef } from '@/tools/dto/tool-definition.dto';

export interface ChatStreamRequestV2 {
  protocol: StreamProtocolV2;
  requestId: string;
  clientMessageId: string;
  sessionId?: string;
  input: UserMessageInput;
  context?: ChatContextInput;
  runtime?: ChatRuntimeOptions;
  response?: ChatResponseOptions;
}

export interface UserMessageInput {
  role: 'user';
  parts: UserMessagePart[];
}

export type UserMessagePart =
  | TextInputPart
  | FileInputPart
  | ImageInputPart
  | ResourceReferencePart
  | CommandInputPart;

export interface TextInputPart {
  type: 'text';
  text: string;
}

export interface FileInputPart {
  type: 'file';
  fileId: string;
  name?: string;
  mimeType?: string;
}

export interface ImageInputPart {
  type: 'image';
  fileId: string;
  mimeType?: string;
  detail?: 'low' | 'high' | 'auto';
}

export interface ResourceReferencePart {
  type: 'resource';
  uri: string;
  title?: string;
  source?: 'mcp' | 'local' | 'web' | 'session';
}

export interface CommandInputPart {
  type: 'command';
  name: string;
  args?: Record<string, unknown>;
}

export interface ChatContextInput {
  includeHistory?: boolean;
  historyLimit?: number;
  fileIds?: string[];
  clientLocation?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    label?: string;
  };
  resources?: Array<{
    uri: string;
    type?: string;
    source?: 'mcp' | 'local' | 'web' | 'session';
  }>;
}

export interface ChatRuntimeOptions {
  provider?: string;
  model?: string;
  credentialId?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: true;
  tools?: ToolDefinitionRef[];
  toolChoice?: 'auto' | 'none' | { type: 'tool'; name: string };
  reasoning?: {
    enabled?: boolean;
    effort?: 'low' | 'medium' | 'high';
    display?: 'none' | 'summary' | 'full';
  };
  autoGenerateSessionName?: boolean;
}

export interface ChatResponseOptions {
  modalities?: Array<'text' | 'image' | 'file' | 'json'>;
  format?: 'text' | 'json_object' | { type: 'json_schema'; schema: Record<string, unknown> };
}
