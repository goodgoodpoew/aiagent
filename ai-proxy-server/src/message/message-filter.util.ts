export function isFailedMessage(metadata: unknown): boolean {
  return (metadata as { status?: string } | null)?.status === 'failed';
}

function getTextProjection(content: string, metadata: unknown): string {
  if (content) return content;

  const parts = (metadata as { parts?: unknown } | null)?.parts;
  if (!Array.isArray(parts)) return content;

  // metadata.parts 里可能包含 reasoning/tool/file 等结构，只允许 text part 回投影到 LLM 历史。
  return parts
    .filter((part): part is { type: 'text'; text: string } =>
      Boolean(part)
      && typeof part === 'object'
      && (part as { type?: unknown }).type === 'text'
      && typeof (part as { text?: unknown }).text === 'string',
    )
    .map((part) => part.text)
    .join('');
}

export interface MessageWithMetadata {
  role: string;
  content: string;
  metadata?: unknown;
}

export function toLlmMessages(
  messages: MessageWithMetadata[],
): Array<{ role: string; content: string }> {
  return messages
    .filter((m) => !isFailedMessage(m.metadata))
    .map(({ role, content, metadata }) => ({ role, content: getTextProjection(content, metadata) }));
}
