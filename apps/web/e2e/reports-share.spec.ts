import { expect, test } from '@playwright/test';
import { forceFlagOn, makeStaff, signUpAndCreateWorkspace } from './helpers';

/**
 * B3 + AD01/AD02 (META_MOCK=1): đồng bộ 1 tài khoản khớp số liệu → PM bật cờ `p0_reports` qua trang nội bộ
 * (checklist đạt) → tạo báo cáo → worker dựng → chia sẻ link → khách mở trang công khai → PDF (worker
 * Chromium) → thu hồi link.
 */
test('PM bật cờ → báo cáo → chia sẻ → trang công khai → PDF → thu hồi', async ({ page, browser }) => {
  test.setTimeout(240_000);
  const ws = `Agency Báo cáo ${Date.now()}`;
  const email = await signUpAndCreateWorkspace(page, { workspace: ws });

  // Chỉ chọn tài khoản khớp số liệu (mock: "Thời trang Linh" có ngày lệch).
  await page.goto('/connections/new');
  await page.getByRole('link', { name: 'Tiếp tục với Meta' }).click();
  await expect(page).toHaveURL(/\/connections\/select/);
  const boxes = page.getByRole('checkbox');
  await expect(boxes).toHaveCount(4);
  for (let i = 0; i < 4; i++) await boxes.nth(i).uncheck();
  await page.getByRole('checkbox', { name: 'Cà phê Nhà Rang' }).check();
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await expect(page).toHaveURL(/\/connections\/assign/);
  await page.locator('[data-testid^="assign-row-"]').first().getByRole('button', { name: 'Xác nhận' }).click();
  await expect(page.getByText('Tất cả tài khoản đã được gán Client.')).toBeVisible();
  await page.getByRole('link', { name: 'Xong, bắt đầu đồng bộ' }).click();
  await expect(page.getByRole('heading', { name: 'Đồng bộ xong dữ liệu 90 ngày' })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(/^Khớp Meta \(lệch [\d,]+%\)$/)).toBeVisible({ timeout: 30_000 });

  // Cờ tắt: không có mục Báo cáo; /reports → trang "tính năng chưa bật".
  await expect(page.getByRole('link', { name: 'Báo cáo', exact: true })).toHaveCount(0);

  // PM bật thêm cờ cho workspace (ADR-0024: ngoại lệ, checklist không còn chặn).
  await makeStaff(email, true);
  await forceFlagOn(page, ws, 'Báo cáo', 'Design partner E2E');

  // R02 → R03: worker dựng báo cáo.
  await page.goto('/reports');
  await page.getByRole('link', { name: '+ Tạo báo cáo' }).click();
  await page.getByRole('button', { name: 'Tạo báo cáo' }).click();
  await expect(page).toHaveURL(/\/reports\/[0-9a-f-]{36}$/);
  await expect(page.getByText(/^Báo cáo cho /)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Số liệu chính')).toBeVisible();
  await expect(page.getByText(/Khớp Meta tính đến/)).toBeVisible();

  // R04: tạo link → khách mở ở trình duyệt khác (không đăng nhập).
  await page.getByRole('link', { name: 'Chia sẻ', exact: true }).click();
  await page.getByRole('button', { name: 'Tạo link chia sẻ' }).click();
  const linkCell = page.locator('td span', { hasText: '/r/' }).first();
  await expect(linkCell).toBeVisible();
  const url = (await linkCell.textContent())!.trim();
  const guest = await browser.newContext();
  const guestPage = await guest.newPage();
  await guestPage.goto(url);
  await expect(guestPage.getByText(/^Báo cáo cho /)).toBeVisible();
  await expect(guestPage.getByText('Powered by AdxLens')).toBeVisible();

  // R07: PDF do worker render bằng Chromium.
  await page.getByRole('button', { name: 'Xuất PDF' }).click();
  await expect(page.getByRole('link', { name: 'Tải PDF' })).toBeVisible({ timeout: 90_000 });

  // Thu hồi → khách thấy "hết hạn hoặc bị thu hồi".
  await page.getByRole('button', { name: 'Thu hồi' }).click();
  await expect(page.getByText('Đã thu hồi')).toBeVisible();
  await guestPage.reload();
  await expect(guestPage.getByText('Liên kết đã hết hạn hoặc bị thu hồi')).toBeVisible();
  await guest.close();
});
