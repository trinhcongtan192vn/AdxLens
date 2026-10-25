import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { forceFlagOn, generateWeeklyNow, makeStaff, signUpAndCreateWorkspace } from './helpers';

/** P103/P104 (P1-01..03): cờ tắt → không có mục Creative; PM bật cờ → thư viện creative → so sánh 2 creative. */
test('P103 creative library → P104 so sánh (sau cờ Gợi ý)', async ({ page }) => {
  test.setTimeout(180_000);
  const ws = `Agency Creative ${Date.now()}`;
  const email = await signUpAndCreateWorkspace(page, { workspace: ws });
  await page.goto('/demo');
  await page.getByRole('button', { name: 'Dùng tài khoản mẫu' }).click();
  await expect(page.getByRole('heading', { name: 'Đồng bộ xong dữ liệu 90 ngày' })).toBeVisible({ timeout: 90_000 });

  await expect(page.getByRole('link', { name: 'Creative', exact: true })).toHaveCount(0);
  await page.goto('/creatives');
  await expect(page).toHaveURL(/\/feature-unavailable/);

  await makeStaff(email, true);
  await forceFlagOn(page, ws, 'Báo cáo', 'E2E creative library');
  await forceFlagOn(page, ws, 'Gợi ý', 'E2E creative library');

  await page.goto('/overview');
  await page.getByRole('link', { name: 'Creative', exact: true }).click();
  await expect(page).toHaveURL(/\/creatives/);
  await expect(page.getByTestId('creative-class').first()).toBeVisible();
  await expect(page.getByTestId('creative-trend')).toContainText('Xu hướng theo tuần');
  const boxes = page.getByRole('checkbox');
  await boxes.nth(0).check();
  await boxes.nth(1).check();
  await page.getByRole('button', { name: 'So sánh' }).click();
  await expect(page).toHaveURL(/\/creatives\/compare/);
  await expect(page.getByRole('heading', { name: 'So sánh creative' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Chi phí / kết quả' })).toBeVisible();

  // P101/P102: Weekly Action List từ phát hiện + creative của dữ liệu mẫu.
  await generateWeeklyNow(ws);
  await page.getByRole('link', { name: 'Việc tuần này', exact: true }).click();
  await expect(page).toHaveURL(/\/weekly-actions/);
  const rows = page.getByTestId('weekly-row');
  await expect(rows.first()).toBeVisible();
  await rows.first().getByRole('combobox', { name: 'Trạng thái' }).selectOption('in_progress');
  await expect(page.getByText('Đã lưu').first()).toBeVisible();
  await rows.first().getByRole('button').first().click();
  await expect(page.getByRole('dialog', { name: 'Chi tiết gợi ý' })).toBeVisible();
  await expect(page.getByText('Vì sao')).toBeVisible();

  // P105: việc vừa "Đã làm" → hiện ở Kết quả trước / sau, kèm lưu ý nhân quả.
  await page.keyboard.press('Escape');
  await rows.first().getByRole('combobox', { name: 'Trạng thái' }).selectOption('done');
  await expect(page.getByText('Đã lưu').first()).toBeVisible();
  await page.getByRole('link', { name: 'Kết quả trước / sau →' }).click();
  await expect(page.getByText(/không phải bằng chứng nhân quả/)).toBeVisible();
  await expect(page.getByTestId('outcome-row')).toHaveCount(1);

  // ADR-0022: Tích hợp có khóa AI tự mang + connector MCP; luồng OAuth đầy đủ như claude.ai.
  await page.goto('/settings/integrations');
  await expect(page.getByTestId('llm-key-card')).toContainText('Mô hình AI của workspace');
  const mcpUrl = (await page.getByTestId('mcp-connector-url').textContent())!.trim();
  const origin = new URL(mcpUrl).origin;
  const meta = await (await page.request.get(`${origin}/.well-known/oauth-authorization-server`)).json();
  const reg = await page.request.post(meta.registration_endpoint, {
    data: { client_name: 'Claude', redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] },
  });
  const clientId = (await reg.json()).client_id as string;
  const verifier = 'e2e-verifier-0123456789-abcdefghijklmnopqrstuvwxyz';
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  let callback = '';
  await page.route('https://claude.ai/**', async (r) => {
    callback = r.request().url();
    await r.fulfill({ status: 200, body: 'ok' });
  });
  await page.goto(
    `/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent('https://claude.ai/api/mcp/auth_callback')}&code_challenge=${challenge}&code_challenge_method=S256&state=s1&resource=${encodeURIComponent(mcpUrl)}`,
  );
  await expect(page.getByTestId('oauth-consent')).toContainText('Claude muốn truy cập AdxLens');
  await page.getByRole('button', { name: 'Cho phép' }).click();
  await expect.poll(() => callback).toContain('code=');
  const code = new URL(callback).searchParams.get('code')!;
  const tok = await (
    await page.request.post(meta.token_endpoint, {
      form: {
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
        code_verifier: verifier,
      },
    })
  ).json();
  const tools = await page.request.post(mcpUrl, {
    headers: { authorization: `Bearer ${tok.access_token}` },
    data: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
  });
  expect(JSON.stringify(await tools.json())).toContain('account_kpis');
  await page.goto('/settings/integrations');
  await expect(page.getByTestId('oauth-grants')).toContainText('Claude');
});
