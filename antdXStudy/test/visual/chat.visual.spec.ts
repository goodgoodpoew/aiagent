import { expect, test, type Page } from '@playwright/test';

const API_BASE_URL = 'http://localhost:3001/api';

async function mockVisualBackend(page: Page) {
  await page.route(/http:\/\/localhost:3001\/api\/sessions(\?.*)?$/, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        sessions: [
          {
            id: 'visual-session',
            title: '视觉回归会话',
            titleStatus: 'done',
            version: 1,
            createdAt: '2026-06-06T00:00:00.000Z',
            updatedAt: '2026-06-06T00:00:00.000Z',
          },
        ],
        cursor: null,
      }),
    });
  });

  await page.route(`${API_BASE_URL}/sessions/events`, async (route) => {
    await route.fulfill({ contentType: 'text/event-stream', body: '\n' });
  });

  await page.route(/http:\/\/localhost:3001\/api\/sessions\/visual-session\/messages(\?.*)?$/, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        messages: [
          {
            id: 'visual-user',
            sessionId: 'visual-session',
            role: 'user',
            content: '请展示 Markdown 表格和超长文本',
            metadata: null,
            createdAt: '2026-06-06T00:00:00.000Z',
          },
          {
            id: 'visual-assistant',
            sessionId: 'visual-session',
            role: 'assistant',
            content: '这是一段用于截图基线的回答。\n\n| 项目 | 状态 |\n| --- | --- |\n| Markdown | 正常 |\n\n`veryveryveryveryveryveryverylongword`',
            metadata: null,
            createdAt: '2026-06-06T00:00:01.000Z',
          },
        ],
        cursor: null,
      }),
    });
  });

  await page.route(/http:\/\/localhost:3001\/api\/sessions\/visual-session\/files(\?.*)?$/, async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ files: [] }) });
  });
}

test.beforeEach(async ({ page }) => {
  await mockVisualBackend(page);
});

test('聊天页桌面和移动端布局截图基线', async ({ page }, testInfo) => {
  await page.goto('/ai/chat');
  await expect(page.getByText('视觉回归会话').first()).toBeVisible();
  await expect(page.getByText('这是一段用于截图基线的回答。')).toBeVisible();

  await expect(page).toHaveScreenshot(`chat-${testInfo.project.name}.png`, {
    fullPage: true,
    animations: 'disabled',
  });
});

// 布局矩阵：在桌面项目下补齐平板 768 与宽屏 1920 基线，覆盖方案 §11.2 的布局容忍度清单。
const layoutMatrix = [
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'wide-1920', width: 1920, height: 1080 },
];

for (const viewport of layoutMatrix) {
  test(`聊天页 ${viewport.name} 布局截图基线`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', '布局矩阵只在桌面 Chromium 项目下采集');

    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/ai/chat');
    await expect(page.getByText('视觉回归会话').first()).toBeVisible();
    await expect(page.getByText('这是一段用于截图基线的回答。')).toBeVisible();

    await expect(page).toHaveScreenshot(`chat-${viewport.name}.png`, {
      fullPage: true,
      animations: 'disabled',
    });
  });
}
