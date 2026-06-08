import type { FileMessagePart, MessagePart, TextMessagePart } from '@/service/stream-protocol';

export interface MessagePartGroups {
  textParts: TextMessagePart[];
  fileParts: FileMessagePart[];
  processParts: MessagePart[];
  referenceParts: Extract<MessagePart, { type: 'reference' }>[];
  errorParts: Extract<MessagePart, { type: 'error' }>[];
  otherParts: MessagePart[];
}

const processPartTypes = new Set<MessagePart['type']>([
  'reasoning',
  'tool_call',
  'tool_result',
  'file_read',
  'process_trace',
  'reference',
  'error',
]);

export function groupMessageParts(parts: MessagePart[]): MessagePartGroups {
  const textParts: TextMessagePart[] = [];
  const fileParts: FileMessagePart[] = [];
  const processParts: MessagePart[] = [];
  const referenceParts: Extract<MessagePart, { type: 'reference' }>[] = [];
  const errorParts: Extract<MessagePart, { type: 'error' }>[] = [];
  const otherParts: MessagePart[] = [];

  parts.forEach((part) => {
    if (part.type === 'text') {
      textParts.push(part);
      return;
    }
    if (part.type === 'file') {
      fileParts.push(part);
      return;
    }
    if (part.type === 'reference') {
      referenceParts.push(part);
    }
    if (part.type === 'error') {
      errorParts.push(part);
    }
    if (processPartTypes.has(part.type)) {
      processParts.push(part);
      return;
    }
    otherParts.push(part);
  });

  return {
    textParts,
    fileParts,
    processParts,
    referenceParts,
    errorParts,
    otherParts,
  };
}
