import { expect, test } from '@playwright/test';
import { makeStaff, signUpAndCreateWorkspace } from './helpers';

/**
 * Trang admin vận hành (ADR-0013): tra cứu workspace, vận hành, đối chiếu, thực thi, thanh toán (sửa gói), xóa dữ
 * liệu, hệ thống (thông báo bảo trì hiện cho khách rồi tắt), mẫu email, nhật ký.
 */
test('superadmin: các trang vận hành, sửa gói, thông báo bảo trì tới khách, mẫu email, nhật ký', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  const ws = `Agency Vận hành ${Date.now()}`;
  const email = await signUpAndCreateWorkspace(page, { workspace: ws });
  await makeStaff(email, true);

  // Tra cứu theo email thành viên → chi tiết workspace.
  await page.goto(`/admin/workspaces?q=${encodeURIComponent(email)}`);
  await page.getByRole('link', { name: ws }).click();
  await expect(page.getByRole('heading', { name: ws })).toBeVisible();
  await expect(page.getByRole('cell', { name: email, exact: true })).toBeVisible();

  // Vận hành: đủ các queue; đối chiếu; thực thi; xóa dữ liệu.
  await page.goto('/admin/operations');
  await expect(page.getByTestId('queue-sync')).toBeVisible();
  await expect(page.getByTestId('queue-execute')).toBeVisible();
  await page.goto('/admin/reconciliation');
  await expect(page.getByRole('heading', { name: 'Đối chiếu toàn hệ thống' })).toBeVisible();
  await page.goto('/admin/execution');
  await expect(page.getByTestId('execution-counts')).toBeVisible();
  await page.goto('/admin/deletions');
  await expect(page.getByRole('heading', { name: 'Yêu cầu xóa dữ liệu' })).toBeVisible();

  // Thanh toán: sửa số tài khoản kèm gói Starter (cần lý do).
  await page.goto('/admin/billing');
  const starter = page.getByTestId('plan-starter');
  const before = await starter.locator('td').nth(3).textContent();
  await page.getByTestId('edit-plan-starter').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Tài khoản kèm gói').fill('6');
  await dialog.getByLabel('Lý do (bắt buộc, ≥ 5 ký tự)').fill('Thử E2E sửa gói');
  await dialog.getByRole('button', { name: 'Sửa' }).click();
  await expect(starter.locator('td').nth(3)).toHaveText('6');

  // Hệ thống: bật thông báo bảo trì → khách thấy banner → tắt.
  const notice = `Bảo trì E2E ${Date.now()}`;
  await page.goto('/admin/system');
  await page.getByTestId('edit-maintenance').click();
  await dialog.getByLabel('Hiện cho mọi khách').check();
  await dialog.getByLabel('Nội dung tiếng Việt').fill(notice);
  await dialog.getByLabel('Nội dung tiếng Anh').fill('Maintenance E2E');
  await dialog.getByLabel('Lý do (bắt buộc, ≥ 5 ký tự)').fill('Thử thông báo bảo trì');
  await dialog.getByRole('button', { name: 'Sửa' }).click();
  await expect(page.getByTestId('maintenance-state')).toContainText(notice);

  const customer = await browser.newContext();
  const cpage = await customer.newPage();
  await signUpAndCreateWorkspace(cpage, { workspace: `Agency Khách ${Date.now()}` });
  await cpage.goto('/overview');
  await expect(cpage.getByTestId('maintenance-banner')).toContainText(notice);

  await page.getByTestId('edit-maintenance').click();
  await dialog.getByLabel('Hiện cho mọi khách').uncheck();
  await dialog.getByLabel('Lý do (bắt buộc, ≥ 5 ký tự)').fill('Bảo trì xong');
  await dialog.getByRole('button', { name: 'Sửa' }).click();
  await expect(page.getByTestId('maintenance-state')).toContainText('Không có thông báo bảo trì.');
  await cpage.reload();
  await expect(cpage.getByTestId('maintenance-banner')).toHaveCount(0);
  await customer.close();

  // Mẫu email: xem trước trong iframe.
  await page.goto('/admin/emails?key=invitation&locale=vi');
  await expect(page.getByTestId('email-preview')).toBeVisible();

  // Nhật ký: có dòng sửa gói và bảo trì; trả lại giá trị gói cũ.
  await page.goto('/admin/audit');
  await expect(page.getByRole('row', { name: /Sửa gói.*Thử E2E sửa gói/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /Bật thông báo bảo trì.*Thử thông báo bảo trì/ })).toBeVisible();
  await page.goto('/admin/billing');
  await page.getByTestId('edit-plan-starter').click();
  await dialog.getByLabel('Tài khoản kèm gói').fill((before ?? '5').trim());
  await dialog.getByLabel('Lý do (bắt buộc, ≥ 5 ký tự)').fill('Trả lại sau E2E');
  await dialog.getByRole('button', { name: 'Sửa' }).click();
  await expect(starter.locator('td').nth(3)).toHaveText((before ?? '5').trim());
});
