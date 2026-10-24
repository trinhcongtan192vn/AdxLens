import { expect, test } from '@playwright/test';
import { signUpAndCreateWorkspace } from './helpers';

/**
 * W2 (ADR-0017, META_MOCK=1): kết nối → gán 1 tài khoản → đồng bộ → onboarding 3 bước theo Client (mục tiêu chính
 * kèm số thực tế, chỉ số phụ, ngành + Page mặc định) → tab Mục tiêu.
 */
test('onboarding mục tiêu theo Client', async ({ page }) => {
  await signUpAndCreateWorkspace(page, { workspace: 'Agency Mục tiêu' });
  await page.goto('/connections/new');
  await expect(page.getByText('Các nhóm quyền Meta sẽ hỏi')).toBeVisible();
  await page.getByRole('link', { name: 'Tiếp tục với Meta' }).click();
  await expect(page).toHaveURL(/\/connections\/select\?connection=/);
  const boxes = page.getByRole('checkbox');
  await expect(boxes).toHaveCount(4);
  for (let i = 1; i < 4; i++) await boxes.nth(i).uncheck();
  await boxes.nth(0).check();
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  const row = page.locator('[data-testid^="assign-row-"]').first();
  await row.getByRole('button', { name: 'Xác nhận' }).click();
  await page.getByRole('link', { name: 'Xong, bắt đầu đồng bộ' }).click();
  await expect(page.getByRole('heading', { name: 'Đồng bộ xong dữ liệu 90 ngày' })).toBeVisible({ timeout: 60_000 });

  // Trang Kết nối: tài sản Meta đọc được (worker làm mới sau OAuth).
  await page.goto('/connections');
  await expect(page.getByText('2 Page')).toBeVisible({ timeout: 30_000 });

  await page.goto('/clients');
  await page.getByRole('main').getByRole('link', { name: 'Đặt mục tiêu' }).first().click();
  await expect(page.getByRole('heading', { name: 'Chỉ số tối ưu chính' })).toBeVisible();
  await page.getByRole('radio', { name: /Chi phí \/ kết quả/ }).click();
  await expect(page.getByText('Chi phí / kết quả thực tế')).toBeVisible();
  await page.getByRole('button', { name: /Dùng giá trị 7 ngày/ }).click();
  await page.getByRole('button', { name: 'Tiếp tục' }).click();

  await expect(page.getByRole('heading', { name: 'Chỉ số thứ 2 và thứ 3' })).toBeVisible();
  await page.getByRole('checkbox', { name: /CTR \(liên kết\)/ }).click();
  await page.getByRole('checkbox', { name: /^CPM/ }).click();
  await expect(page.getByText('Đã chọn 2/2')).toBeVisible();
  await page.getByRole('button', { name: 'Tiếp tục' }).click();

  await expect(page.getByRole('heading', { name: 'Ngành và tài sản mặc định' })).toBeVisible();
  await page.getByLabel('Ngành', { exact: true }).selectOption({ label: 'Du lịch, lưu trú' });
  await page.getByLabel('Ngành con').selectOption({ label: 'Homestay, glamping' });
  await page.getByLabel('Page mặc định').selectOption({ label: 'Trang Mock A' });
  await page.getByRole('button', { name: 'Hoàn tất' }).click();

  await expect(page).toHaveURL(/tab=goals/);
  await expect(page.getByText('Đã lưu mục tiêu')).toBeVisible();
  await expect(page.getByText('Du lịch, lưu trú › Homestay, glamping')).toBeVisible();
  await expect(page.getByText('Page mặc định: Trang Mock A')).toBeVisible();
  await expect(page.getByText(/(tốt|kém) hơn [\d.]+%|—/).first()).toBeVisible();
});
