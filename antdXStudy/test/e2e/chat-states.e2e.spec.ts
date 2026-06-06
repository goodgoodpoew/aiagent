import { expect, test, type Page } from '@playwright/test';

const API_BASE_URL = 'http://localhost:3001/api';
const now = '2026-06-06T00:00:00.000Z';

function sseBody(events: Array<Record<string, unknown>>) {
  return `${events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}`).join('\n\n')}\n\ndata: [DONE]\n\n`;
}

async function routeJson(page: Page, pattern: RegExp | string, body: unknown) {
  await page.route(pattern, async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
}

test.describe('聊天页边界状态', () => {
  test('上游失败时展示错误且输入框仍可继续输入', async ({ page }) => {
    await routeJson(page, /http:\/\/localhost:3001\/api\/sessions(\?.*)?$/, { sessions: [], cursor: null });
    await page.route(`${API_BASE_URL}/sessions/events`, (route) =>
      route.fulfill({ contentType: 'text/event-stream', body: '\n' }),
    );
    await routeJson(page, /\/api\/sessions\/session-fail\/messages(\?.*)?$/, { messages: [], cursor: null });
    await routeJson(page, /\/api\/sessions\/session-fail\/files(\?.*)?$/, { files: [] });

    await page.route(`${API_BASE_URL}/ai/chat/stream/v2`, async (route) => {
      const payload = await route.request().postDataJSON();
      const requestId = payload.requestId as string;
      const clientMessageId = payload.clientMessageId as string;
      await route.fulfill({
        contentType: 'text/event-stream',
        body: sseBody([
          {
            protocol: 'aiagent.stream.v2',
            id: 'e-session',
            type: 'session.created',
            traceId: 't',
            requestId,
            sessionId: 'session-fail',
            timestamp: now,
            sequence: 1,
            data: { session: { id: 'session-fail', title: '失败会话', titleStatus: 'done', version: 1, createdAt: now, updatedAt: now } },
          },
          {
            protocol: 'aiagent.stream.v2',
            id: 'e-created',
            type: 'message.created',
            traceId: 't',
            requestId,
            sessionId: 'session-fail',
            messageId: 'assistant-fail',
            timestamp: now,
            sequence: 2,
            data: {
              clientMessageId,
              userMessage: { id: 'user-fail', role: 'user', content: '触发失败', parts: [{ id: 'u', type: 'text', text: '触发失败', status: 'done' }], status: 'done', metadata: { clientMessageId, requestId }, createdAt: now },
              assistantMessage: { id: 'assistant-fail', role: 'assistant', content: '', parts: [], status: 'streaming', metadata: { requestId }, createdAt: now },
            },
          },
          {
            protocol: 'aiagent.stream.v2',
            id: 'e-failed',
            type: 'stream.failed',
            traceId: 't',
            requestId,
            sessionId: 'session-fail',
            messageId: 'assistant-fail',
            timestamp: now,
            sequence: 3,
            data: { code: 'PROVIDER_ERROR', message: '上游连接失败，请稍后重试', retryable: true, stage: 'provider_stream' },
          },
        ]),
      });
    });

    await page.goto('/ai/chat');
    const textbox = page.getByRole('textbox');
    await textbox.scrollIntoViewIfNeeded();
    await textbox.fill('触发失败');
    await textbox.press('Enter');

    await expect(page.getByText('上游连接失败，请稍后重试')).toBeVisible();
    // 失败后仍可继续输入
    await textbox.fill('再次输入');
    await expect(textbox).toHaveValue('再次输入');
  });

  test('刷新后从后端恢复历史，且 v1 与 v2 消息混合展示', async ({ page }) => {
    await routeJson(page, /http:\/\/localhost:3001\/api\/sessions(\?.*)?$/, {
      sessions: [
        { id: 'session-hist', title: '历史会话', titleStatus: 'done', version: 1, createdAt: now, updatedAt: now },
      ],
      cursor: null,
    });
    await page.route(`${API_BASE_URL}/sessions/events`, (route) =>
      route.fulfill({ contentType: 'text/event-stream', body: '\n' }),
    );
    await routeJson(page, /\/api\/sessions\/session-hist\/messages(\?.*)?$/, {
      messages: [
        { id: 'm-v1', sessionId: 'session-hist', role: 'assistant', content: '旧版纯文本回答', metadata: null, createdAt: now },
        {
          id: 'm-v2',
          sessionId: 'session-hist',
          role: 'assistant',
          content: '',
          metadata: { status: 'done', parts: [{ id: 'm-v2:text', type: 'text', text: '新版结构化回答', status: 'done' }] },
          createdAt: '2026-06-06T00:00:01.000Z',
        },
      ],
      cursor: null,
    });
    await routeJson(page, /\/api\/sessions\/session-hist\/files(\?.*)?$/, { files: [] });

    await page.goto('/ai/chat');

    await expect(page.getByText('历史会话').first()).toBeVisible();
    await expect(page.getByText('旧版纯文本回答')).toBeVisible();
    await expect(page.getByText('新版结构化回答')).toBeVisible();
  });
});
