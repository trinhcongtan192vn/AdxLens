import { expect, test } from '@playwright/test';
import { signUpAndCreateWorkspace } from './helpers';

/** S01 (PRD P0-02): xem AdxLens với tài khoản mẫu trước khi kết nối; banner "dữ liệu mẫu"; xóa được. */
test('S01 tài khoản mẫu → đồng bộ → banner dữ liệu mẫu → xóa', async ({ page }) => {
  test.setTimeout(180_000);
  await signUpAndCreateWorkspace(page, { workspace: `Agency Mẫu ${Date.now()}` });
  await page.goto('/connections/new');
  await page.getByRole('link', { name: 'Xem tài khoản mẫu trước' }).click();
  await expect(page.getByRole('heading', { name: 'Xem AdxLens với tài khoản mẫu' })).toBeVisible();
  await page.getByRole('button', { name: 'Dùng tài khoản mẫu' }).click();
  await expect(page).toHaveURL(/\/connections\/sync/);
  await expect(page.getByRole('heading', { name: 'Đồng bộ xong dữ liệu 90 ngày' })).toBeVisible({ timeout: 90_000 });

  await page.goto('/clients');
  await expect(page.getByText(/Bạn đang xem dữ liệu mẫu/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Khách mẫu · Cà phê' })).toBeVisible();
  await page.getByRole('button', { name: 'Xóa dữ liệu mẫu' }).click();
  await expect(page.getByText(/Bạn đang xem dữ liệu mẫu/)).toHaveCount(0);
  await expect(page.getByText('Chưa có Client')).toBeVisible();

  // Báo cáo mẫu công khai ở trang chủ.
  await page.goto('/r/demo');
  await expect(page.getByText('Báo cáo mẫu — số liệu minh họa, không phải dữ liệu thật.')).toBeVisible();
});
