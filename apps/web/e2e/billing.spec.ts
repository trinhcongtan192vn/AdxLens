import { expect, test } from '@playwright/test';
import { signUpAndCreateWorkspace } from './helpers';

/** ST03 (026–027): workspace mới ở Free, hạn mức 0/1; lưu thông tin xuất hóa đơn; ST04 hủy thanh toán. */
test('ST03 gói Free + thông tin xuất hóa đơn; ST04 kết quả hủy', async ({ page }) => {
  await signUpAndCreateWorkspace(page, { workspace: `Agency Gói ${Date.now()}` });
  await page.goto('/settings/billing');
  await expect(page.getByTestId('billing-plan')).toHaveText('Free');
  await expect(page.getByTestId('billing-usage')).toHaveText('0/1');
  await expect(page.getByRole('button', { name: 'Chọn gói' })).toHaveCount(3);

  await page.getByLabel('Tên công ty').fill('Công ty Sao Mai');
  await page.getByLabel('Mã số thuế').fill('0312345678');
  await page.getByRole('button', { name: 'Lưu' }).click();
  await expect(page.getByText('Đã lưu').first()).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Tên công ty')).toHaveValue('Công ty Sao Mai');

  await page.goto('/settings/billing/checkout?status=cancel');
  await expect(page.getByText('Bạn đã hủy thanh toán. Gói hiện tại không thay đổi.')).toBeVisible();
});
