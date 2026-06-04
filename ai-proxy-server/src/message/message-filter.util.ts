export function isFailedMessage(metadata: unknown): boolean {
  return (metadata as { status?: string } | null)?.status === 'failed';
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
    .map(({ role, content }) => ({ role, content }));
}
