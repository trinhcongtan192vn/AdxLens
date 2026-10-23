import { expect, test, type Page } from '@playwright/test';
import { generateWeeklyNow, makeStaff, signUpAndCreateWorkspace } from './helpers';

async function enableWithOverride(page: Page, ws: string, flagName: string) {
  await page.goto(`/admin/flags?q=${encodeURIComponent(ws)}`);
  await page.getByRole('button', { name: `${flagName} · ${ws}` }).click();
  // Dữ liệu mẫu có ngày lệch số liệu → checklist chưa đạt; PM vượt qua (được ghi log).
  const checklist = page.getByTestId('flag-checklist');
  await expect(checklist.getByText(/Đạt|Chưa đạt/).first()).toBeVisible();
  const override = page.getByLabel('Vượt checklist chưa đạt (được ghi log)');
  if (await override.count()) await override.check();
  await page.getByLabel('Lý do (bắt buộc, ≥ 5 ký tự)').fill('E2E creative library');
  await page.getByRole('button', { name: 'Bật cờ' }).click();
  await expect(page.getByRole('button', { name: `${flagName} · ${ws}` })).toContainText('Bật');
}

/** P103/P104 (P1-01..03): cờ tắt → không có mục Creative; PM bật cờ → thư viện creative → so sánh 2 creative. */
test('P103 creative library → P104 so sánh (sau cờ Gợi ý)', async ({ page }) => {
  test.setTimeout(180_000);
  const ws = `Agency Creative ${Date.now()}`;
  const email = await signUpAndCreateWorkspace(page, { workspace: ws });
  await page.goto('/demo');
  await page.getByRole('button', { name: 'Dùng tài khoản mẫu' }).click();
  await expect(page.getByRole('heading', { name: 'Đồng bộ xong dữ liệu 90 ngày' })).toBeVisible({ timeout: 90_000 });

  await expect(page.getByRole('link', { name: 'Creative', exact: true })).toHaveCount(0);
  await page.goto('/creatives');
  await expect(page).toHaveURL(/\/feature-unavailable/);

  await makeStaff(email, true);
  await enableWithOverride(page, ws, 'Báo cáo');
  await enableWithOverride(page, ws, 'Gợi ý');

  await page.goto('/overview');
  await page.getByRole('link', { name: 'Creative', exact: true }).click();
  await expect(page).toHaveURL(/\/creatives/);
  await expect(page.getByTestId('creative-class').first()).toBeVisible();
  const boxes = page.getByRole('checkbox');
  await boxes.nth(0).check();
  await boxes.nth(1).check();
  await page.getByRole('button', { name: 'So sánh' }).click();
  await expect(page).toHaveURL(/\/creatives\/compare/);
  await expect(page.getByRole('heading', { name: 'So sánh creative' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Chi phí / kết quả' })).toBeVisible();

  // P101/P102: Weekly Action List từ phát hiện + creative của dữ liệu mẫu.
  await generateWeeklyNow(ws);
  await page.getByRole('link', { name: 'Việc tuần này', exact: true }).click();
  await expect(page).toHaveURL(/\/weekly-actions/);
  const rows = page.getByTestId('weekly-row');
  await expect(rows.first()).toBeVisible();
  await rows.first().getByRole('combobox', { name: 'Trạng thái' }).selectOption('in_progress');
  await expect(page.getByText('Đã lưu').first()).toBeVisible();
  await rows.first().getByRole('button').first().click();
  await expect(page.getByRole('dialog', { name: 'Chi tiết gợi ý' })).toBeVisible();
  await expect(page.getByText('Vì sao')).toBeVisible();

  // P105: việc vừa "Đã làm" → hiện ở Kết quả trước / sau, kèm lưu ý nhân quả.
  await page.keyboard.press('Escape');
  await rows.first().getByRole('combobox', { name: 'Trạng thái' }).selectOption('done');
  await expect(page.getByText('Đã lưu').first()).toBeVisible();
  await page.getByRole('link', { name: 'Kết quả trước / sau →' }).click();
  await expect(page.getByText(/không phải bằng chứng nhân quả/)).toBeVisible();
  await expect(page.getByTestId('outcome-row')).toHaveCount(1);
});
