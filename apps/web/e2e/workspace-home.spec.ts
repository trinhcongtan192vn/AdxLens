import { expect, test } from '@playwright/test';
import { signUpAndCreateWorkspace } from './helpers';

/**
 * W3–W5 (META_MOCK=1): giao diện Workspace — chuyển từ giao diện cổ điển, trang chủ (sức khỏe, tracking, 4 KPI có
 * độ phủ dữ liệu, cần chú ý, gợi ý cảnh báo), đổi phạm vi + kỳ, tùy chỉnh KPI, tạo cảnh báo, quay về cổ điển.
 */
test('giao diện Workspace: trang chủ + cảnh báo', async ({ page }) => {
  await signUpAndCreateWorkspace(page, { workspace: 'Agency Workspace' });
  await page.goto('/connections/new');
  await page.getByRole('link', { name: 'Tiếp tục với Meta' }).click();
  const boxes = page.getByRole('checkbox');
  await expect(boxes).toHaveCount(4);
  for (let i = 1; i < 4; i++) await boxes.nth(i).uncheck();
  await boxes.nth(0).check();
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await page.locator('[data-testid^="assign-row-"]').first().getByRole('button', { name: 'Xác nhận' }).click();
  await page.getByRole('link', { name: 'Xong, bắt đầu đồng bộ' }).click();
  await expect(page.getByRole('heading', { name: 'Đồng bộ xong dữ liệu 90 ngày' })).toBeVisible({ timeout: 60_000 });

  await page.goto('/overview');
  await page.getByTestId('switch-workspace-ui').click();
  await expect(page).toHaveURL(/\/w$/);
  await expect(page.getByRole('navigation', { name: 'Điều hướng Workspace' })).toBeVisible();
  await expect(page.getByTestId('ws-health')).toContainText('Sức khỏe tài khoản');
  await expect(page.getByTestId('ws-tracking')).toContainText('Pixel');
  await expect(page.getByTestId('ws-coverage')).toHaveText(/Dữ liệu \d+\/7 ngày/);
  await expect(page.getByTestId('ws-kpi-spend')).toBeVisible();
  await expect(page.getByTestId('ws-attention')).toBeVisible();
  await expect(page.getByTestId('ws-alert-suggestions')).toBeVisible();

  // Kỳ 30 ngày → độ phủ theo 30 ngày.
  await page.getByRole('button', { name: '30 ngày' }).click();
  await expect(page.getByTestId('ws-coverage')).toHaveText(/Dữ liệu \d+\/30 ngày/);

  // Tùy chỉnh 4 KPI.
  await page.getByRole('button', { name: 'Tùy chỉnh' }).click();
  const dialog = page.getByRole('dialog');
  for (const name of ['Giá trị chuyển đổi', 'ROAS', 'Chi phí / lượt mua']) {
    await dialog.getByRole('checkbox', { name, exact: true }).click();
  }
  for (const name of ['CTR (liên kết)', 'CPM', 'Chi phí / kết quả']) {
    await dialog.getByRole('checkbox', { name, exact: true }).click();
  }
  await dialog.getByRole('button', { name: 'Lưu' }).click();
  await expect(page.getByTestId('ws-kpi-ctr')).toBeVisible();
  await expect(page.getByTestId('ws-kpi-roas')).toHaveCount(0);

  // Cảnh báo: tạo từ trang Cảnh báo, có gợi ý trung bình 7 ngày.
  await page.getByRole('link', { name: 'Cảnh báo', exact: true }).click();
  await page.getByRole('button', { name: 'Tạo cảnh báo' }).first().click();
  await page.getByRole('dialog').getByLabel('Chỉ số').selectOption({ label: 'CPM' });
  await expect(page.getByRole('dialog').getByText(/Trung bình 7 ngày qua/)).toBeVisible();
  await page.getByRole('dialog').getByLabel('Ngưỡng').fill('60000');
  await page.getByRole('dialog').getByRole('button', { name: 'Tạo cảnh báo' }).click();
  await expect(page.getByText('Đã tạo cảnh báo')).toBeVisible();
  await expect(page.getByRole('cell', { name: /CPM vượt/ })).toBeVisible();
  await page.getByRole('button', { name: 'Tắt cảnh báo' }).click();
  await expect(page.getByText('Đã tắt', { exact: true })).toBeVisible();

  await page.getByTestId('switch-classic').click();
  await expect(page).toHaveURL(/\/overview$/);
});
