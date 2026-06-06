import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';

const API_BASE_URL =
  process.env.GRAY_BACKEND_API_BASE_URL ||
  process.env.UMI_APP_API_BASE_URL ||
  'http://localhost:3001/api';
const USER_ID =
  process.env.UMI_APP_USER_ID || '9a74c501-9d60-441b-b1ba-7b3eb469dce0';
const PROVIDER = 'gray-mock-provider';
const DEFAULT_MODEL = 'gray-mock-model';
const ALT_MODEL = 'gray-alt-model';

interface ParsedSseEvent {
  event?: string;
  data?: Record<string, unknown>;
}

function parseSseEvents(raw: string): ParsedSseEvent[] {
  return raw
    .split('\n\n')
    .map((block) => {
      const lines = block.split('\n');
      const event = lines
        .find((line) => line.startsWith('event: '))
        ?.slice(7)
        .trim();
      const data = lines
        .filter((line) => line.startsWith('data: '))
        .map((line) => line.slice(6))
        .join('\n')
        .trim();

      if (!event || !data || data === '[DONE]') {
        return undefined;
      }

      return { event, data: JSON.parse(data) as Record<string, unknown> };
    })
    .filter((event): event is ParsedSseEvent => Boolean(event));
}

async function postStream(
  request: APIRequestContext,
  text: string,
  options?: { sessionId?: string; model?: string; fileIds?: string[] },
) {
  const response = await request.post(`${API_BASE_URL}/ai/chat/stream/v2`, {
    headers: { 'X-User-Id': USER_ID },
    data: {
      protocol: 'aiagent.stream.v2',
      requestId: `gray-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      clientMessageId: `client-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      sessionId: options?.sessionId,
      input: { role: 'user', parts: [{ type: 'text', text }] },
      context: options?.fileIds?.length
        ? { fileIds: options.fileIds }
        : undefined,
      runtime: {
        provider: PROVIDER,
        model: options?.model || DEFAULT_MODEL,
        stream: true,
        reasoning: { enabled: false, display: 'none' },
        autoGenerateSessionName: false,
      },
    },
  });

  expect(response.status()).toBeGreaterThanOrEqual(200);
  expect(response.status()).toBeLessThan(300);
  return parseSseEvents(await response.text());
}

function findSessionId(events: ParsedSseEvent[]) {
  return events
    .map((event) => event.data?.sessionId)
    .find((value): value is string => typeof value === 'string');
}

async function sendUiMessage(page: Page, text: string) {
  const textbox = page.getByRole('textbox');
  await textbox.scrollIntoViewIfNeeded();
  await textbox.fill(text);
  await textbox.press('Enter');
}

test.describe.configure({ mode: 'serial' });

test('灰度 API 发布门禁：健康、流式、文件、模型切换、上游失败、软删除', async ({
  request,
}) => {
  const health = await request.get(`${API_BASE_URL}/ai/health`);
  expect(health.ok()).toBe(true);

  const providers = await request.get(`${API_BASE_URL}/model-providers`);
  expect(await providers.json()).toEqual(
    expect.objectContaining({
      success: true,
      data: expect.arrayContaining([
        expect.objectContaining({ name: PROVIDER, configured: true }),
      ]),
    }),
  );

  const firstEvents = await postStream(request, '灰度普通消息');
  expect(firstEvents.map((event) => event.event)).toContain('stream.completed');
  const sessionId = findSessionId(firstEvents);
  expect(sessionId).toBeTruthy();

  const upload = await request.post(`${API_BASE_URL}/files/upload`, {
    headers: {
      'X-User-Id': USER_ID,
      'X-File-Name': encodeURIComponent('gray-note.txt'),
    },
    multipart: {
      purpose: 'chat',
      displayName: 'gray-note.txt',
      file: {
        name: 'gray-note.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('灰度文件内容：发布门禁文件问答。', 'utf8'),
      },
    },
  });
  expect(upload.ok()).toBe(true);
  const uploadBody = await upload.json();
  const fileId = uploadBody.data.id as string;

  const fileEvents = await postStream(request, '请基于灰度文件回答', {
    sessionId,
    fileIds: [fileId],
  });
  expect(fileEvents.map((event) => event.event)).toContain('stream.completed');

  const switchedEvents = await postStream(request, '切换模型后继续对话', {
    sessionId,
    model: ALT_MODEL,
  });
  expect(switchedEvents.map((event) => event.event)).toContain(
    'stream.completed',
  );

  const failedEvents = await postStream(request, '灰度触发上游错误', {
    sessionId,
  });
  expect(failedEvents.map((event) => event.event)).toContain('stream.failed');

  const deleted = await request.delete(
    `${API_BASE_URL}/sessions/${sessionId}`,
    {
      headers: { 'X-User-Id': USER_ID },
    },
  );
  expect(deleted.ok()).toBe(true);
});

test('灰度浏览器 smoke：聊天、刷新恢复、上传文件后继续提问', async ({
  page,
}) => {
  await page.goto('/ai/chat');
  await expect(page.getByText('在下方输入消息开始对话')).toBeVisible();

  await sendUiMessage(page, '灰度浏览器消息');
  await expect(page.getByText('灰度浏览器消息')).toBeVisible();
  await expect(page.getByText(/灰度 mock 回答/)).toBeVisible();

  await page.reload();
  await expect(page.getByText('灰度浏览器消息')).toBeVisible();

  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByTitle('添加附件').click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: 'gray-ui-note.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('灰度 UI 文件内容', 'utf8'),
  });

  await expect(page.getByText('gray-ui-note.txt')).toBeVisible();
  await expect(page.getByText(/已就绪|已上传/)).toBeVisible();

  await sendUiMessage(page, '请基于上传文件回答');
  await expect(page.getByText('请基于上传文件回答')).toBeVisible();
  await expect(page.getByText(/灰度 mock 回答/)).toBeVisible();
});
