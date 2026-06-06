import { expect, test, type Page } from '@playwright/test';

const API_BASE_URL = 'http://localhost:3001/api';
const now = '2026-06-06T00:00:00.000Z';

async function mockBackend(page: Page) {
  await page.route(/http:\/\/localhost:3001\/api\/sessions(\?.*)?$/, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ sessions: [], cursor: null }),
    });
  });

  await page.route(`${API_BASE_URL}/sessions/events`, async (route) => {
    await route.fulfill({
      contentType: 'text/event-stream',
      body: '\n',
    });
  });

  await page.route(/http:\/\/localhost:3001\/api\/sessions\/session-e2e\/messages(\?.*)?$/, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ messages: [], cursor: null }),
    });
  });

  await page.route(/http:\/\/localhost:3001\/api\/sessions\/session-e2e\/files(\?.*)?$/, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ files: [] }),
    });
  });

  await page.route(`${API_BASE_URL}/ai/chat/stream/v2`, async (route) => {
    const payload = await route.request().postDataJSON();
    const requestId = payload.requestId as string;
    const clientMessageId = payload.clientMessageId as string;

    const events = [
      {
        protocol: 'aiagent.stream.v2',
        id: 'event-session',
        type: 'session.created',
        traceId: 'trace-e2e',
        requestId,
        sessionId: 'session-e2e',
        timestamp: now,
        sequence: 1,
        data: {
          session: {
            id: 'session-e2e',
            title: 'Playwright 会话',
            titleStatus: 'done',
            version: 1,
            createdAt: now,
            updatedAt: now,
          },
        },
      },
      {
        protocol: 'aiagent.stream.v2',
        id: 'event-message-created',
        type: 'message.created',
        traceId: 'trace-e2e',
        requestId,
        sessionId: 'session-e2e',
        messageId: 'assistant-e2e',
        timestamp: now,
        sequence: 2,
        data: {
          clientMessageId,
          userMessage: {
            id: 'user-e2e',
            role: 'user',
            content: '你好，测试主流程',
            parts: [{ id: 'user-text', type: 'text', text: '你好，测试主流程', status: 'done' }],
            status: 'done',
            metadata: { clientMessageId, requestId },
            createdAt: now,
          },
          assistantMessage: {
            id: 'assistant-e2e',
            role: 'assistant',
            content: '',
            parts: [],
            status: 'streaming',
            metadata: { requestId },
            createdAt: now,
          },
        },
      },
      {
        protocol: 'aiagent.stream.v2',
        id: 'event-part-started',
        type: 'message.part.started',
        traceId: 'trace-e2e',
        requestId,
        sessionId: 'session-e2e',
        messageId: 'assistant-e2e',
        timestamp: now,
        sequence: 3,
        data: {
          part: { id: 'assistant-text', type: 'text', text: '', status: 'streaming' },
        },
      },
      {
        protocol: 'aiagent.stream.v2',
        id: 'event-part-delta',
        type: 'message.part.delta',
        traceId: 'trace-e2e',
        requestId,
        sessionId: 'session-e2e',
        messageId: 'assistant-e2e',
        timestamp: now,
        sequence: 4,
        data: { partId: 'assistant-text', type: 'text', delta: '这是 mock 流式回答。' },
      },
      {
        protocol: 'aiagent.stream.v2',
        id: 'event-message-completed',
        type: 'message.completed',
        traceId: 'trace-e2e',
        requestId,
        sessionId: 'session-e2e',
        messageId: 'assistant-e2e',
        timestamp: now,
        sequence: 5,
        data: {
          message: {
            id: 'assistant-e2e',
            role: 'assistant',
            content: '这是 mock 流式回答。',
            parts: [{ id: 'assistant-text', type: 'text', text: '这是 mock 流式回答。', status: 'done' }],
            status: 'done',
            metadata: { requestId },
            createdAt: now,
          },
        },
      },
      {
        protocol: 'aiagent.stream.v2',
        id: 'event-stream-completed',
        type: 'stream.completed',
        traceId: 'trace-e2e',
        requestId,
        sessionId: 'session-e2e',
        messageId: 'assistant-e2e',
        timestamp: now,
        sequence: 6,
        data: { completedAt: now },
      },
    ];

    await route.fulfill({
      contentType: 'text/event-stream',
      body: `${events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}`).join('\n\n')}\n\ndata: [DONE]\n\n`,
    });
  });
}

test.beforeEach(async ({ page }) => {
  await mockBackend(page);
});

test('聊天页空状态和 mock 流式主流程可用', async ({ page }) => {
  await page.goto('/ai/chat');

  await expect(page.getByText('在下方输入消息开始对话')).toBeVisible();

  const textbox = page.getByRole('textbox');
  await textbox.scrollIntoViewIfNeeded();
  await textbox.fill('你好，测试主流程');
  await textbox.press('Enter');

  await expect(page.getByText('你好，测试主流程')).toBeVisible();
  await expect(page.getByText('这是 mock 流式回答。')).toBeVisible();
  await expect(page.getByText('Playwright 会话').first()).toBeVisible();
});
