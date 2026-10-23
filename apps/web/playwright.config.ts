import { defineConfig, devices } from '@playwright/test';

/**
 * E2E (L3 mục 14): chạy trên stack local (Supabase CLI + Redis) với `META_MOCK=1`.
 * `pnpm test:e2e` tự bật Next dev nếu chưa chạy.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // Trên CI thêm reporter `github`: lỗi E2E hiện thành annotation đọc được qua API công khai.
  reporter: [
    ...(process.env.CI ? [['github'] as const] : []),
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: [
    {
      command: 'pnpm dev',
      url: 'http://localhost:3000/api/health',
      reuseExistingServer: true,
      timeout: 180_000,
    },
    // Worker riêng cho E2E (đồng bộ S04/S06); chờ dòng log khởi động.
    {
      command: 'pnpm --filter @adxlens/worker dev',
      wait: { stdout: /"meta_mock":true/ },
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
