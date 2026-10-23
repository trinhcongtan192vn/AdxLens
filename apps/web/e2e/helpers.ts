import { expect, type Page } from '@playwright/test';

const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';

export const uniqueEmail = (prefix: string) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@e2e.local`;
export const PASSWORD = 'mat-khau-e2e-dai';

type MailSummary = { ID: string; Subject: string; Created: string };

/** Chờ email mới nhất gửi tới địa chỉ, trả HTML + text (Mailpit API). */
export async function waitForEmail(to: string, opts: { subject?: RegExp; timeoutMs?: number } = {}) {
  const deadline = Date.now() + (opts.timeoutMs ?? 30_000);
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    if (res.ok) {
      const data = (await res.json()) as { messages: MailSummary[] };
      const msg = data.messages.find((m) => !opts.subject || opts.subject.test(m.Subject));
      if (msg) {
        const full = (await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json()) as {
          HTML: string;
          Text: string;
        };
        return { subject: msg.Subject, html: full.HTML, text: full.Text };
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Không thấy email tới ${to}`);
}

export function firstLink(html: string, includes: string): string {
  const links = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!.replaceAll('&amp;', '&'));
  const link = links.find((l) => l.includes(includes));
  if (!link) throw new Error(`Không có link chứa "${includes}"`);
  return link;
}

/** Đăng ký + xác minh email + tạo workspace; trả email đã dùng. */
export async function signUpAndCreateWorkspace(page: Page, opts: { workspace?: string; name?: string } = {}) {
  const email = uniqueEmail('owner');
  await page.goto('/signup');
  await page.getByLabel('Họ tên').fill(opts.name ?? 'Trịnh Công Tân');
  await page.getByLabel('Email công việc').fill(email);
  await page.getByLabel('Mật khẩu').fill(PASSWORD);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
  await expect(page).toHaveURL(/\/verify-email/);

  const mail = await waitForEmail(email);
  await page.goto(firstLink(mail.html, 'verify'));
  await expect(page).toHaveURL(/\/onboarding\/workspace/);
  await page.getByLabel('Tên agency').fill(opts.workspace ?? 'Agency E2E');
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await expect(page).toHaveURL(/\/overview/);
  return email;
}

/**
 * Cấp quyền staff (PM nếu `canEnableFlags`) cho tài khoản E2E — chỉ ở DB local của E2E, giống
 * `pnpm seed:staff`. Bật cờ vẫn đi qua giao diện AD01/AD02 (core/flags).
 */
export async function makeStaff(email: string, canEnableFlags = true): Promise<void> {
  const { createDb } = await import('@adxlens/db');
  const { sql } = await import('drizzle-orm');
  const { db, close } = createDb(process.env.DATABASE_URL!);
  try {
    await db.execute(sql`insert into app.staff (user_id, can_enable_flags)
      select id, ${canEnableFlags} from app.users where email = ${email}
      on conflict (user_id) do update set can_enable_flags = excluded.can_enable_flags`);
  } finally {
    await close();
  }
}
