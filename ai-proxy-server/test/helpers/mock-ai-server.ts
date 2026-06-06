import * as nock from 'nock';

export function mockOpenAiChatCompletion(baseUrl: string, responseBody: unknown) {
  return nock(baseUrl).post('/chat/completions').reply(200, responseBody);
}

export function mockOpenAiSse(baseUrl: string, chunks: string[]) {
  return nock(baseUrl)
    .post('/chat/completions')
    .reply(200, chunks.map((chunk) => `data: ${chunk}\n\n`).join(''), {
      'Content-Type': 'text/event-stream',
    });
}

export function mockOpenAiError(
  baseUrl: string,
  status: number,
  body: unknown = { error: 'upstream' },
) {
  return nock(baseUrl).post('/chat/completions').reply(status, body);
}
