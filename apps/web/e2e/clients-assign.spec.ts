import { expect, test } from '@playwright/test';
import { signUpAndCreateWorkspace } from './helpers';

/**
 * F1 (META_MOCK=1): kết nối Meta giả → S04 chọn tài khoản → S05 gán Client → S06 đồng bộ → C01 → C02.
 * Mock Meta có 4 tài khoản; ở đây chọn 2 để kiểm tra banner "còn N dòng".
 */
test('S04 → S05 gán Client → S06 đồng bộ → C01 → C02', async ({ page }) => {
  await signUpAndCreateWorkspace(page, { workspace: 'Agency Gán' });

  await page.goto('/connections/new');
  await page.getByRole('link', { name: 'Tiếp tục với Meta' }).click();
  await expect(page).toHaveURL(/\/connections\/select\?connection=/);

  const boxes = page.getByRole('checkbox');
  await expect(boxes).toHaveCount(4);
  for (let i = 0; i < 4; i++) await boxes.nth(i).uncheck();
  await boxes.nth(0).check();
  await boxes.nth(1).check();
  await page.getByRole('button', { name: 'Tiếp tục' }).click();

  await expect(page).toHaveURL(/\/connections\/assign/);
  await expect(page.getByRole('heading', { name: 'Gán mỗi tài khoản cho một Client' })).toBeVisible();
  await expect(page.getByText('Còn 2 dòng chưa xác nhận')).toBeVisible();

  // Dòng 1: tạo Client mới theo tên gợi ý (mặc định của ô chọn).
  const rows = page.locator('[data-testid^="assign-row-"]');
  await rows.nth(0).getByRole('button', { name: 'Xác nhận' }).click();
  await expect(rows.nth(0).getByText('Đã xác nhận')).toBeVisible();
  await expect(page.getByText('Còn 1 dòng chưa xác nhận')).toBeVisible();

  // Dòng 2: tạo Client bằng hộp thoại rồi chọn.
  await page.getByRole('button', { name: '+ Tạo Client mới' }).click();
  await page.getByLabel('Tên Client').fill('Khách E2E');
  await page.getByRole('button', { name: 'Tạo', exact: true }).click();
  await rows.nth(1).getByLabel('Client').selectOption({ label: 'Khách E2E' });
  await rows.nth(1).getByRole('button', { name: 'Xác nhận' }).click();
  await expect(page.getByText('Tất cả tài khoản đã được gán Client.')).toBeVisible();

  // S06: worker (chạy cùng `pnpm dev`) backfill 90 ngày từ Meta giả.
  await page.getByRole('link', { name: 'Xong, bắt đầu đồng bộ' }).click();
  await expect(page).toHaveURL(/\/connections\/sync/);
  await expect(page.getByRole('progressbar')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Đồng bộ xong dữ liệu 90 ngày' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('100% · 2 / 2 tài khoản')).toBeVisible();
  // Đối chiếu chạy sau đồng bộ: mỗi tài khoản có badge Khớp/Lệch (mock lệch 1,4% ở act_100000002).
  await expect(page.getByText(/^(Khớp|Lệch) [\d,]+%$/)).toHaveCount(2, { timeout: 30_000 });
  await page.getByRole('link', { name: 'Tiếp tục' }).click();
  await expect(page).toHaveURL(/\/clients$/);
  await expect(page.getByText(/2 Client · 2 tài khoản/)).toBeVisible();
  await expect(page.getByText('tài khoản chưa xác nhận Client')).toHaveCount(0);

  await page.getByPlaceholder('Tìm Client hoặc tài khoản…').fill('khach e2e');
  await expect(page.getByRole('link', { name: 'Khách E2E' })).toBeVisible();
  await page.getByRole('link', { name: 'Khách E2E' }).click();

  await expect(page.getByRole('heading', { name: 'Khách E2E' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Chiến dịch' })).toHaveAttribute('aria-selected', 'true');
  // C02 → D04 qua badge đối chiếu.
  await page.getByRole('link', { name: /^(Khớp|Lệch) / }).click();
  await expect(page.getByRole('heading', { name: 'Đối chiếu số liệu' })).toBeVisible();
  await expect(page.getByRole('cell', { name: /^Chi tiêu \(/ })).toBeVisible();
  await page.goBack();
  await page.getByRole('tab', { name: 'Cài đặt' }).click();
  await expect(page.getByText('Tài khoản QC của Client')).toBeVisible();
  await page.getByRole('button', { name: 'Bỏ gán' }).click();
  await expect(page.getByText('Client này chưa có tài khoản QC.')).toBeVisible();

  await page.goto('/clients');
  await expect(page.getByText('1 tài khoản chưa xác nhận Client')).toBeVisible();
});
