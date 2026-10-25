import { expect, test } from '@playwright/test';
import {
  evaluateLiveRulesNow,
  forceFlagOn,
  makeStaff,
  setPlanNow,
  signUpAndCreateWorkspace,
  simulateShadowNow,
  useDaytimeTimezone,
} from './helpers';

/**
 * B8 P2b (META_MOCK=1): rule builder từ mẫu (P212) → backtest (P213) → lưu chạy thử → giả lập 14 ngày (chỉ
 * local) → bật chạy thật → rule tạo hành động tự động qua gateway → nhật ký + hiệu quả (P215).
 */
test('P2b: mẫu → backtest → shadow → giả lập 14 ngày → live → hành động tự động → hiệu quả', async ({ page }) => {
  test.setTimeout(300_000);
  const ws = `Agency Tự động ${Date.now()}`;
  const email = await signUpAndCreateWorkspace(page, { workspace: ws });

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

  await makeStaff(email, true);
  await setPlanNow(ws, 'growth');
  for (const f of ['Báo cáo', 'Gợi ý', 'Duyệt 1 click', 'Tự động hóa'])
    await forceFlagOn(page, ws, f, 'E2E rule tự động');
  // ADR-0024: kết nối có ads_management = được ghi ngay.
  await page.goto('/connections/write-access');
  await expect(page.getByTestId('write-access-row').first()).toContainText('Được ghi');

  // P212: mẫu "ad mệt", nới điều kiện để chắc chắn khớp dữ liệu mẫu, backtest rồi lưu.
  await page.goto('/automation');
  await page.getByRole('link', { name: 'Tạo rule' }).click();
  await page.getByRole('button', { name: /Tạm dừng quảng cáo mệt/ }).click();
  const conds = page.getByTestId('rule-condition');
  await conds.nth(0).getByRole('combobox', { name: 'Chỉ số' }).selectOption('spend');
  await conds.nth(0).getByRole('combobox', { name: 'So sánh' }).selectOption('gte');
  await conds.nth(0).getByRole('textbox', { name: 'Giá trị' }).fill('0');
  await conds.nth(1).getByRole('button', { name: 'Bỏ' }).click();
  await page.getByLabel(/Tối đa hành động mỗi ngày/).fill('1');
  await page.getByRole('button', { name: 'Chạy backtest 30 ngày' }).click();
  await expect(page.getByTestId('backtest-result')).toBeVisible();
  await page.getByRole('button', { name: 'Lưu và chạy thử' }).click();
  await expect(page.getByTestId('rule-mode')).toHaveText('Chạy thử');
  await expect(page.getByRole('button', { name: 'Bật chạy thật' })).toBeDisabled();

  // Giả lập 14 ngày chạy thử (chỉ local) → bật chạy thật.
  await simulateShadowNow(ws);
  await page.reload();
  await expect(page.getByTestId('shadow-progress')).toContainText('14/14');
  await expect(page.getByTestId('evaluation-row')).toHaveCount(14);
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Bật chạy thật' }).click();
  await expect(page.getByTestId('rule-mode')).toHaveText('Đang chạy');

  // Rule live tạo hành động tự động; worker thực hiện qua gateway. Guardrail chặn 22:00–06:00 giờ tài khoản nên
  // chuyển tài khoản QC sang múi giờ đang ban ngày (test chạy được mọi giờ, guardrail giữ nguyên).
  await useDaytimeTimezone(ws);
  await evaluateLiveRulesNow(ws);
  await page.goto('/action-log');
  await expect(async () => {
    await page.reload();
    await expect(page.getByTestId('action-row').filter({ hasText: 'Thành công' })).toHaveCount(1);
  }).toPass({ timeout: 60_000 });
  await expect(page.getByTestId('action-row').first()).toContainText('Hệ thống');

  // P215.
  await page.goto('/automation/results');
  await expect(page.getByTestId('effectiveness-row')).toHaveCount(1);
  await expect(page.getByTestId('effectiveness-row')).toContainText('1');
});
