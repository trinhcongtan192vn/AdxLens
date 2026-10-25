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

  // Khung chung: /overview cũ chuyển về trang chủ /w.
  await page.goto('/overview');
  await expect(page).toHaveURL(/\/w$/);
  await expect(page.getByRole('navigation', { name: 'Điều hướng chính' })).toBeVisible();
  await expect(page.getByTestId('ws-health')).toContainText('Sức khỏe tài khoản');
  await expect(page.getByTestId('ws-tracking')).toContainText('Pixel');
  await expect(page.getByTestId('ws-coverage')).toHaveText(/Dữ liệu \d+\/7 ngày/);
  await expect(page.getByTestId('ws-kpi-spend')).toBeVisible();
  await expect(page.getByTestId('ws-attention')).toBeVisible();
  await expect(page.getByTestId('ws-alert-suggestions')).toBeVisible();

  // Kỳ 30 ngày → độ phủ theo 30 ngày. PM 25/10: bộ lọc kỳ nằm trong khối Hiệu suất (một bộ duy nhất trên trang).
  await expect(page.getByTestId('period-filter')).toHaveCount(1);
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

  // PM 25/10: Thông báo + Cảnh báo là một màn — tab Hộp thư (sự kiện, lọc theo loại) và Quy tắc cảnh báo.
  // Link sidebar có kèm số thông báo chưa đọc trong tên → chọn theo đường dẫn.
  await page.locator('nav a[href="/w/alerts"]').click();
  await expect(page).toHaveURL(/\/w\/alerts$/);
  await expect(page.getByRole('heading', { name: 'Thông báo', level: 1 })).toBeVisible();
  await expect(page.getByTestId('inbox-filters')).toBeVisible();
  await page.getByRole('button', { name: 'Báo cáo', exact: true }).click();
  await expect(page.getByTestId('inbox')).toHaveCount(0);
  // Trang không lọc theo ngày → không có bộ lọc kỳ.
  await expect(page.getByTestId('period-filter')).toHaveCount(0);
  // Đường dẫn cũ /notifications về màn chung.
  await page.goto('/notifications');
  await expect(page).toHaveURL(/\/w\/alerts$/);
  await page.getByRole('tab', { name: 'Quy tắc cảnh báo' }).click();
  await expect(page).toHaveURL(/tab=rules/);
  await page.getByRole('button', { name: 'Tạo cảnh báo' }).first().click();
  await page.getByRole('dialog').getByLabel('Chỉ số').selectOption({ label: 'CPM' });
  await expect(page.getByRole('dialog').getByText(/^Trung bình 7 ngày qua: /)).toBeVisible();
  await page.getByRole('dialog').getByLabel('Ngưỡng').fill('60000');
  await page.getByRole('dialog').getByRole('button', { name: 'Tạo cảnh báo' }).click();
  await expect(page.getByText('Đã tạo cảnh báo')).toBeVisible();
  await expect(page.getByRole('cell', { name: /CPM vượt/ })).toBeVisible();
  await page.getByRole('button', { name: 'Tắt cảnh báo' }).click();
  await expect(page.getByText('Đã tắt', { exact: true })).toBeVisible();

  // W6: lưới quảng cáo — thẻ theo từng quảng cáo, lọc loại.
  await page.getByRole('link', { name: 'Quảng cáo', exact: true }).click();
  await expect(page.getByTestId('ad-card').first()).toBeVisible();
  const all = await page.getByTestId('ad-card').count();
  await page.getByRole('button', { name: 'Video', exact: true }).click();
  await expect(async () => expect(await page.getByTestId('ad-card').count()).toBeLessThan(all)).toPass();

  // W7: Ads Manager — dòng tổng, mở chiến dịch thấy nhóm QC, chế độ phẳng theo quảng cáo.
  await page.getByRole('link', { name: 'Ads Manager', exact: true }).click();
  await expect(page.getByTestId('am-total')).toBeVisible();
  await page.getByTestId('am-row-campaign').first().getByRole('button', { name: 'Mở' }).click();
  await expect(page.getByTestId('am-row-adset').first()).toBeVisible();
  await page.getByRole('button', { name: 'Quảng cáo', exact: true }).click();
  await expect(page.getByTestId('am-row-ad').first()).toBeVisible();

  // W8: phễu, địa lý, mở rộng.
  await page.getByRole('link', { name: 'Phễu', exact: true }).click();
  await expect(page.getByTestId('funnel-total')).toContainText('Click liên kết');
  await page.getByRole('tab', { name: 'Nhóm QC' }).click();
  await expect(page).toHaveURL(/by=adset/);
  await page.getByRole('tab', { name: 'Giai đoạn phễu' }).click();
  await expect(page.getByTestId('funnel-stages')).toContainText('Tìm khách mới');
  await expect(page.getByTestId('stage-chart')).toBeVisible();
  await page.getByRole('tab', { name: 'Trang đích' }).click();
  await expect(page.getByTestId('funnel-landing')).toContainText('shop.example.vn');
  await page.getByRole('link', { name: 'Địa lý', exact: true }).click();
  await expect(page.getByTestId('geo-table')).toBeVisible();
  await page.getByRole('tab', { name: 'Quốc gia · Tier' }).click();
  await expect(page.getByTestId('geo-tiers')).toContainText('Tier 3');
  await page.getByRole('link', { name: 'Mở rộng', exact: true }).click();
  await expect(page.getByTestId('fatigue-chart')).toContainText('Quảng cáo có mệt không?');
  await expect(page.getByTestId('quadrant-burning_out')).toBeVisible();
  await page.getByRole('link', { name: 'Business', exact: true }).click();
  await expect(page.getByTestId('business-blended')).toContainText('ROAS');
  await expect(page.getByTestId('business-accounts')).toContainText('VND');
  await page.getByRole('link', { name: 'Audiences', exact: true }).click();
  await expect(page.getByTestId('audiences-table')).toContainText('Lookalike');
  await expect(page.getByTestId('interest-suggestions')).toContainText('Chăm sóc da');
  // Xuất PDF (in): khi in, sidebar + bộ chọn ẩn, dòng phạm vi / kỳ hiện.
  await expect(page.getByTestId('ws-export-pdf')).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('navigation', { name: 'Điều hướng chính' })).toBeHidden();
  // Kỳ đang chọn là 30 ngày (đổi ở đầu test).
  await expect(page.getByText(/· 30 ngày$/)).toBeVisible();
  await page.emulateMedia({ media: 'screen' });

  // W9: AI Agents sau cờ P1 (workspace mới chưa bật) → không có menu, trang chặn ở server, không có ô hỏi nổi.
  await expect(page.getByRole('link', { name: 'AI Agents' })).toHaveCount(0);
  await expect(page.getByTestId('ws-ask-bar')).toHaveCount(0);
  await page.goto('/w/agents');
  await expect(page).toHaveURL(/\/feature-unavailable/);
  await page.goto('/w');

  // Mở trang có từ giao diện cũ (Clients → chi tiết khách / tài khoản): vẫn cùng sidebar của khung chung.
  await page.getByRole('link', { name: 'Clients', exact: true }).click();
  await expect(page).toHaveURL(/\/clients$/);
  await expect(page.getByTestId('ws-create')).toBeVisible();
  await expect(page.getByTestId('page-toolbar')).toBeVisible();
  await expect(page.getByTestId('page-toolbar').getByRole('combobox')).toHaveCount(0);
  await page.goto('/w');
  await expect(page.getByTestId('page-toolbar')).toHaveCount(0);

  // PM 25/10: chọn Client ở MỘT nơi (sidebar) — chỉ lọc dữ liệu: vẫn trang này, sidebar không đổi; Client có 1 tài
  // khoản → không có bộ chọn tài khoản ở đầu trang.
  const switcher = page.getByTestId('client-switcher');
  const firstClient = await switcher.locator('option').nth(1).getAttribute('value');
  await switcher.selectOption(firstClient!);
  await expect(switcher).toHaveValue(firstClient!);
  await expect(page).toHaveURL(/\/w$/);
  await expect(page.getByTestId('agency-nav')).toBeVisible();
  await expect(page.getByTestId('ws-scope')).toHaveCount(0);
  await switcher.selectOption('');
  await expect(switcher).toHaveValue('');
});
