import { expect, test } from '@playwright/test';
import { firstLink, PASSWORD, signUpAndCreateWorkspace, uniqueEmail, waitForEmail } from './helpers';

const SHOTS = 'test-results/screens';

test('trang công khai M01, M02 hiển thị, đổi ngôn ngữ được', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Báo cáo Meta Ads có bằng chứng/ })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/M01.png`, fullPage: true });
  await page.goto('/pricing');
  await expect(page.getByText('1.490.000')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/M02.png`, fullPage: true });
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('heading', { name: 'Pricing' })).toBeVisible();
});

test('F1: đăng ký → xác minh email → tạo workspace → vào app; Cài đặt; mời thành viên', async ({ page }) => {
  await signUpAndCreateWorkspace(page, { workspace: 'Agency Sao Mai E2E' });
  await expect(page.getByRole('navigation', { name: 'Điều hướng chính' })).toBeVisible();
  // Cờ P1/P2 tắt: 4 mục bị ẩn.
  await expect(page.getByRole('link', { name: 'Việc tuần này' })).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/O01-shell.png` });

  await page.goto('/settings/workspace');
  await expect(page.getByRole('tab', { name: 'Workspace' })).toHaveAttribute('aria-selected', 'true');
  // Múi giờ lấy từ trình duyệt (Asia/Ho_Chi_Minh), không phải múi giờ máy chủ.
  await expect(page.getByLabel('Múi giờ mặc định')).toHaveValue('Asia/Ho_Chi_Minh');
  await page.getByLabel('Tên agency').fill('Agency Sao Mai Đổi Tên');
  await page.getByRole('button', { name: 'Lưu thay đổi' }).click();
  await expect(page.getByText('Đã lưu')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/ST01.png` });

  await page.goto('/settings/members');
  await expect(page.getByText('Workspace mới chỉ có bạn')).toBeVisible();
  await page.getByRole('button', { name: '+ Mời thành viên' }).first().click();
  const invitee = uniqueEmail('buyer');
  await page.getByLabel('Email').fill(invitee);
  await page.getByRole('button', { name: 'Gửi lời mời' }).click();
  await expect(page.getByText(`Đã gửi lời mời tới ${invitee}`)).toBeVisible();
  await expect(page.getByText('Chưa chấp nhận')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/ST02.png` });

  // Bộ chọn workspace: vai trò + "Tạo workspace mới"; đã có 1 workspace Free → tạo thêm bị chặn, gợi ý dùng Client.
  await page.getByTestId('workspace-switcher').click();
  await expect(page.getByRole('menuitem', { name: /Agency Sao Mai Đổi Tên.*Owner/ })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Tạo workspace mới' }).click();
  await expect(page).toHaveURL(/\/onboarding\/workspace/);
  await expect(page.getByText('Mỗi workspace là một agency riêng')).toBeVisible();
  await page.getByLabel('Tên agency').fill('Agency Thứ Hai');
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await expect(page.getByText('Bạn đã sở hữu một workspace gói Free')).toBeVisible();
  await page.getByRole('link', { name: 'Quay lại' }).click();
  await expect(page).toHaveURL(/\/w$/);

  const invite = await waitForEmail(invitee, { subject: /mời bạn/ });
  const link = firstLink(invite.html, '/invite/');

  // Đăng xuất qua menu avatar (X07).
  await page.getByRole('button', { name: 'Menu tài khoản' }).click();
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(page).toHaveURL(/\/login/);

  // A06: người mới đặt mật khẩu và vào workspace.
  await page.goto(link);
  await expect(page.getByRole('heading', { name: /Bạn được mời vào Agency Sao Mai Đổi Tên/ })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/A06.png` });
  await page.getByLabel('Họ tên').fill('Nguyễn Văn B');
  await page.getByLabel('Mật khẩu').fill(PASSWORD);
  await page.getByRole('button', { name: 'Chấp nhận và vào workspace' }).click();
  await expect(page).toHaveURL(/\/w$/);
  // Buyer không thấy Báo cáo và Kết nối.
  await expect(page.getByRole('link', { name: 'Báo cáo' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Kết nối' })).toHaveCount(0);
});

test('A03: sai mật khẩu báo số lần còn lại; email chưa có cũng cùng thông điệp', async ({ page }) => {
  await page.goto('/login');
  await page.screenshot({ path: `${SHOTS}/A03.png` });
  await page.getByLabel('Email').fill(uniqueEmail('nobody'));
  await page.getByLabel('Mật khẩu').fill('sai-mat-khau');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByText(/Email hoặc mật khẩu không đúng. Còn 4 lần thử/)).toBeVisible();
});

test('A01: email đã có tài khoản báo như Penpot', async ({ page }) => {
  const email = await signUpAndCreateWorkspace(page);
  await page.context().clearCookies();
  await page.goto('/signup');
  await page.getByLabel('Họ tên').fill('Người Khác');
  await page.getByLabel('Email công việc').fill(email);
  await page.getByLabel('Mật khẩu').fill(PASSWORD);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
  await expect(page.getByText('Email này đã có tài khoản. Hãy đăng nhập hoặc đặt lại mật khẩu.')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/A01-error.png` });
});
