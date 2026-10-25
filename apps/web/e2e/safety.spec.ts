import { expect, test } from '@playwright/test';
import { seedForeignClient, signUpAndCreateWorkspace } from './helpers';

/** implementation-guide 4.4 — những thử phải thất bại đúng cách. */
test('an toàn: truy cập chéo workspace, /admin của người thường, API sau cờ khi cờ tắt', async ({ page }) => {
  await signUpAndCreateWorkspace(page, { workspace: `Agency An toàn ${Date.now()}` });

  // 1. Client của workspace B gọi từ phiên workspace A → 404, không lộ tên.
  const foreign = await seedForeignClient();
  const r = await page.request.get(`/api/v1/clients/${foreign}`);
  expect(r.status()).toBe(404);
  expect(await r.text()).not.toContain('Client B bí mật');

  // 2. Người không phải staff vào /admin → 404 (không lộ có trang nội bộ).
  const admin = await page.goto('/admin/flags');
  expect(admin?.status()).toBe(404);

  // 3. API của tính năng sau cờ khi cờ tắt → 404; trang mở thẳng → "chưa bật".
  for (const path of [
    '/api/v1/recommendations',
    '/api/v1/creatives?account_id=00000000-0000-4000-8000-000000000000&from=2026-10-01&to=2026-10-07',
    '/api/v1/actions',
    '/api/v1/automation-rules',
  ]) {
    expect((await page.request.get(path)).status(), path).toBe(404);
  }
  await page.goto('/weekly-actions');
  await expect(page).toHaveURL(/\/feature-unavailable/);
});
