import { expect, test } from '@playwright/test';
import { makeStaff, signUpAndCreateWorkspace } from './helpers';

/**
 * ADR-0013: operator đề xuất bật cờ → superadmin duyệt (checklist, vượt có log) → cờ bật → nhật ký admin ghi lại;
 * trang Đội ngũ: superadmin đổi vai trò operator.
 */
test('operator đề xuất bật cờ → superadmin duyệt → cờ bật, có nhật ký; đổi vai trò staff', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  const ws = `Agency Vai trò ${Date.now()}`;
  const opEmail = await signUpAndCreateWorkspace(page, { workspace: ws });
  await makeStaff(opEmail, false);

  // Operator: ô cờ tắt → hộp thoại gửi đề xuất (không bật trực tiếp).
  await page.goto(`/admin/flags?q=${encodeURIComponent(ws)}`);
  await expect(page.getByText(`${opEmail} · Operator`)).toBeVisible();
  await page.getByRole('button', { name: `Báo cáo · ${ws}` }).click();
  await expect(page.getByText(/đề xuất sẽ được gửi cho superadmin duyệt/)).toBeVisible();
  await page.getByLabel('Lý do (bắt buộc, ≥ 5 ký tự)').fill(`Khách cần báo cáo ${ws}`);
  await page.getByRole('button', { name: 'Gửi đề xuất' }).click();
  const panel = page.getByTestId('flag-proposals');
  await expect(panel.getByText(`Khách cần báo cáo ${ws}`)).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Duyệt' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: `Báo cáo · ${ws}` })).toContainText('Tắt');

  // Superadmin (phiên khác): duyệt — workspace chưa có dữ liệu nên checklist chưa đạt → vượt có ghi log.
  const sa = await browser.newContext();
  const saPage = await sa.newPage();
  const saEmail = await signUpAndCreateWorkspace(saPage, { workspace: `Agency PM ${Date.now()}` });
  await makeStaff(saEmail, true);
  await saPage.goto(`/admin/flags?q=${encodeURIComponent(ws)}`);
  const saPanel = saPage.getByTestId('flag-proposals');
  await saPanel.locator('li', { hasText: ws }).getByRole('button', { name: 'Duyệt' }).click();
  await saPage.getByLabel('Vượt checklist chưa đạt (được ghi log)').check();
  await saPage.getByLabel('Ghi chú (không bắt buộc)').fill(`Duyệt ${ws}`);
  await saPage.getByRole('dialog').getByRole('button', { name: 'Duyệt' }).click();
  await expect(saPage.getByRole('button', { name: `Báo cáo · ${ws}` })).toContainText('Bật');

  // Nhật ký admin (superadmin thấy cả đề xuất của operator).
  await saPage.goto('/admin/audit');
  await expect(saPage.getByRole('row', { name: new RegExp(`Duyệt đề xuất bật cờ.*Duyệt ${ws}`) })).toBeVisible();
  await expect(saPage.getByRole('row', { name: new RegExp(`Đề xuất bật cờ.*Khách cần báo cáo ${ws}`) })).toBeVisible();

  // Đội ngũ: superadmin nâng operator lên superadmin (cần lý do).
  await saPage.goto('/admin/staff');
  const row = saPage.getByTestId(`staff-${opEmail}`);
  await row.getByRole('button', { name: 'Chuyển thành Superadmin' }).click();
  const dialog = saPage.getByRole('dialog');
  await dialog.getByLabel('Lý do (bắt buộc, ≥ 5 ký tự)').fill('Lên trưởng ca vận hành');
  await dialog.getByRole('button', { name: 'Xác nhận' }).click();
  await expect(row).toContainText('Superadmin');
  await sa.close();
});
