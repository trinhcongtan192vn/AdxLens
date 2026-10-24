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
  await expect(page.getByText(/^(Khớp Meta \(lệch [\d,]+%\)|Lệch [\d,]+% so với Meta)$/)).toHaveCount(2, {
    timeout: 30_000,
  });
  // O01: tổng quan agency có Client vừa gán, health và chi tiêu.
  await page.goto('/overview');
  await expect(page.getByRole('heading', { name: 'Tổng quan' })).toBeVisible();
  await expect(page.getByRole('main').getByRole('table').getByRole('link', { name: 'Khách E2E' })).toBeVisible();
  await expect(page.getByText('Chi tiêu 7 ngày').first()).toBeVisible();
  await page.goto('/connections/sync');
  await page.getByRole('link', { name: 'Tiếp tục' }).click();
  await expect(page).toHaveURL(/\/clients$/);
  await expect(page.getByText(/2 Client · 2 tài khoản/)).toBeVisible();
  await expect(page.getByText('tài khoản chưa xác nhận Client')).toHaveCount(0);

  await page.getByPlaceholder('Tìm Client hoặc tài khoản…').fill('khach e2e');
  await expect(page.getByRole('main').getByRole('table').getByRole('link', { name: 'Khách E2E' })).toBeVisible();
  await page.getByRole('main').getByRole('table').getByRole('link', { name: 'Khách E2E' }).click();

  await expect(page.getByRole('heading', { name: 'Khách E2E' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Chiến dịch' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('columnheader', { name: 'Chiến dịch' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'ROAS' })).toBeVisible();
  // C02 → D04 qua badge đối chiếu.
  await page.getByRole('link', { name: /^(Khớp|Lệch) / }).click();
  await expect(page.getByRole('heading', { name: 'Đối chiếu số liệu' })).toBeVisible();
  await expect(page.getByRole('cell', { name: /^Chi tiêu \(/ })).toBeVisible();
  await page.goBack();
  await page.getByRole('tab', { name: 'Cài đặt' }).click();
  await expect(page.getByText('Tài khoản QC của Client')).toBeVisible();

  // D01 → D02 → D03 (audit chạy sau đối chiếu khớp; tài khoản lệch có thể chưa có phát hiện).
  const clientSettings = page.url();
  await page.locator('a[href^="/accounts/"]').first().click();
  await expect(page.getByTestId('health-score')).toBeVisible();
  await page.getByRole('link', { name: 'Xem tất cả phát hiện' }).click();
  await expect(page.getByRole('heading', { name: /Phát hiện/ })).toBeVisible();
  const findingLinks = page.locator('a[href*="finding="]');
  if ((await findingLinks.count()) > 0) {
    await findingLinks.first().click();
    await expect(page.getByText('Vì sao')).toBeVisible();
    await expect(page.getByText('không do mô hình ngôn ngữ tạo')).toBeVisible();
    await page.getByRole('button', { name: 'Đã làm' }).click();
    await expect(page.getByText('Đã cập nhật phát hiện')).toBeVisible();
  }
  await page.goto(clientSettings);
  await expect(page.getByText('Tài khoản QC của Client')).toBeVisible();
  await page.getByRole('button', { name: 'Bỏ gán' }).click();
  await expect(page.getByText('Client này chưa có tài khoản QC.')).toBeVisible();

  await page.goto('/clients');
  await expect(page.getByText('1 tài khoản chưa xác nhận Client')).toBeVisible();

  // S07: ngắt kết nối → banner chờ xóa có mã → tra cứu ở trang hướng dẫn xóa dữ liệu.
  await page.goto('/connections');
  await page.getByRole('button', { name: 'Ngắt kết nối và xóa dữ liệu' }).click();
  await expect(page.getByRole('button', { name: 'Ngắt kết nối', exact: true })).toBeDisabled();
  await page.getByLabel('Tôi hiểu dữ liệu sẽ bị xóa').check();
  await page.getByRole('button', { name: 'Ngắt kết nối', exact: true }).click();
  const banner = page.getByText(/Đang chờ xóa dữ liệu \(mã XD-[A-Z0-9]{8}\)/);
  await expect(banner).toBeVisible();
  const code = (await banner.textContent())!.match(/XD-[A-Z0-9]{8}/)![0];
  await page.goto(`/data-deletion?code=${code}`);
  await expect(page.getByText('Đã nhận yêu cầu, đang chờ xử lý.')).toBeVisible();
});
