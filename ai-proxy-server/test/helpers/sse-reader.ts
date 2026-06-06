export interface ParsedSseEvent<T = unknown> {
  event?: string;
  id?: string;
  data?: T;
}

export function parseSseEvents<T = unknown>(raw: string): ParsedSseEvent<T>[] {
  return raw
    .split('\n\n')
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const event: ParsedSseEvent<T> = {};
      for (const line of block.split('\n')) {
        const separator = line.indexOf(':');
        if (separator === -1) continue;

        const key = line.slice(0, separator);
        const value = line.slice(separator + 1).trim();
        if (key === 'event') event.event = value;
        if (key === 'id') event.id = value;
        if (key === 'data') event.data = JSON.parse(value) as T;
      }
      return event;
    });
}
