import { expect, test } from '@playwright/test';
import { forceFlagOn, generateWeeklyNow, makeStaff, setPlanNow, signUpAndCreateWorkspace } from './helpers';

/**
 * B7 P2a (META_MOCK=1): cấp quyền ghi (P201) → guardrails (P205) → duyệt 1 click từ Việc tuần này (P202) →
 * worker thực hiện + xác minh → nhật ký (P203/P204) → hoàn tác → kill switch (X04).
 */
test('P2a: quyền ghi → duyệt → thực hiện + xác minh → hoàn tác → kill switch', async ({ page }) => {
  test.setTimeout(300_000);
  const ws = `Agency Duyệt ${Date.now()}`;
  const email = await signUpAndCreateWorkspace(page, { workspace: ws });

  // Kết nối Meta (mock), một tài khoản, gán Client, đồng bộ.
  await page.goto('/connections/new');
  await page.getByRole('link', { name: 'Tiếp tục với Meta' }).click();
  const boxes = page.getByRole('checkbox');
  await expect(boxes).toHaveCount(4);
  for (let i = 0; i < 4; i++) await boxes.nth(i).uncheck();
  await page.getByRole('checkbox', { name: 'Cà phê Nhà Rang' }).check();
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await page.locator('[data-testid^="assign-row-"]').first().getByRole('button', { name: 'Xác nhận' }).click();
  await page.getByRole('link', { name: 'Xong, bắt đầu đồng bộ' }).click();
  await expect(page.getByRole('heading', { name: 'Đồng bộ xong dữ liệu 90 ngày' })).toBeVisible({ timeout: 90_000 });

  // PM bật cờ; gói Growth (thay thanh toán).
  await makeStaff(email, true);
  await setPlanNow(ws, 'growth');
  for (const f of ['Báo cáo', 'Gợi ý', 'Duyệt 1 click']) await forceFlagOn(page, ws, f, 'E2E duyệt hành động');

  // ADR-0024: kết nối đã có ads_management = được ghi ngay, không cần bước "Cấp quyền ghi".
  await page.goto('/connections/write-access');
  await expect(page.getByTestId('write-access-row').first()).toContainText('Được ghi');

  // P101 → P202: duyệt tạm dừng ad mệt.
  await generateWeeklyNow(ws);
  await page.goto('/weekly-actions');
  const row = page.locator('[data-testid="weekly-row"][data-source="creative_fatigue"]').first();
  await expect(row).toBeVisible();
  await row.getByRole('button').first().click();
  await page.getByTestId('approve-open').click();
  await expect(page.getByTestId('approve-change')).toContainText('Đang chạy → Tạm dừng');
  await page.getByTestId('approve-confirm').click();
  await expect(page).toHaveURL(/\/action-log\/[0-9a-f-]{36}$/);

  // P204: worker thực hiện + xác minh.
  await expect(async () => {
    await page.reload();
    await expect(page.getByTestId('action-status')).toHaveText('Thành công');
  }).toPass({ timeout: 60_000 });
  await expect(page.getByTestId('action-timeline')).toContainText('Đọc lại để xác minh');

  // Hoàn tác.
  await page.getByRole('button', { name: 'Hoàn tác' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Hoàn tác' }).click();
  await expect(page).toHaveURL(/\/action-log\/[0-9a-f-]{36}$/);
  await expect(async () => {
    await page.reload();
    await expect(page.getByTestId('action-status')).toHaveText('Thành công');
  }).toPass({ timeout: 60_000 });
  await page.goto('/action-log');
  await expect(page.getByTestId('action-row')).toHaveCount(2);
  await expect(page.getByTestId('action-row').filter({ hasText: 'Đã hoàn tác' })).toHaveCount(1);

  // Ads Manager mới: sửa ngân sách nhóm QC ngay trong bảng → hộp duyệt qua Execution Gateway.
  await page.goto('/w/ads-manager');
  await page.getByRole('button', { name: 'Nhóm QC', exact: true }).click();
  await page.getByTestId('am-edit-budget').first().click();
  await expect(page.getByRole('dialog').getByLabel('Ngân sách ngày mới')).toBeVisible();
  await page.keyboard.press('Escape');

  // Ad Launcher (ADR-0023): chọn creative → tạo quảng cáo (tạm dừng) qua Execution Gateway.
  await page.goto('/w/launcher');
  // Nhóm QC đầu tiên chọn sẵn; chọn creative đầu (ô có nhãn "Chọn …").
  await expect(page.getByTestId('launcher-adsets').getByRole('checkbox').first()).toBeChecked();
  await page
    .getByTestId('ad-launcher')
    .getByRole('checkbox', { name: /^Chọn / })
    .first()
    .check();
  await page.getByTestId('launch-ads').click();
  await expect(page.getByTestId('launcher-done')).toBeVisible();
  await expect(page.getByTestId('audience-launcher')).toContainText('Audience Launcher');

  // P205 kill switch → banner X04.
  await page.goto('/settings/guardrails');
  await page.getByRole('button', { name: 'Bật kill switch' }).click();
  await page.getByLabel('Lý do (bắt buộc, ≥ 5 ký tự)').fill('E2E thử kill switch');
  await page.getByRole('dialog').getByRole('button', { name: 'Bật kill switch' }).click();
  await expect(page.getByTestId('kill-switch-state')).toHaveText('Đang bật');
  await page.goto('/overview');
  await expect(page.getByText(/Kill switch đang bật/)).toBeVisible();
});
