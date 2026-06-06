import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test/gray',
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-gray-report' }],
  ],
  use: {
    baseURL: process.env.GRAY_FRONTEND_URL || 'http://127.0.0.1:8000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: process.env.GRAY_SKIP_FRONTEND_WEBSERVER
    ? undefined
    : {
        command: 'pnpm dev --host 127.0.0.1',
        url: 'http://127.0.0.1:8000/ai/chat',
        reuseExistingServer: true,
        timeout: 120_000,
      },
  projects: [
    {
      name: 'gray-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
});
