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
 * Cấp quyền staff (superadmin nếu `canEnableFlags`, không thì operator) cho tài khoản E2E — chỉ ở DB local của E2E, giống
 * `pnpm seed:staff`. Bật cờ vẫn đi qua giao diện AD01/AD02 (core/flags).
 */
export async function makeStaff(email: string, canEnableFlags = true): Promise<void> {
  const { createDb } = await import('@adxlens/db');
  const { sql } = await import('drizzle-orm');
  const { db, close } = createDb(process.env.DATABASE_URL!);
  try {
    // ADR-0013: canEnableFlags = superadmin, không = operator.
    const role = canEnableFlags ? 'superadmin' : 'operator';
    await db.execute(sql`insert into app.staff (user_id, role, can_enable_flags)
      select id, ${role}, ${canEnableFlags} from app.users where email = ${email}
      on conflict (user_id) do update set role = excluded.role, can_enable_flags = excluded.can_enable_flags`);
  } finally {
    await close();
  }
}

/**
 * Tạo Weekly Action List ngay cho workspace (thay cho job thứ Hai 07:00) — gọi đúng hàm core mà job
 * `recommend:build` dùng, chỉ ở DB local của E2E.
 */
export async function generateWeeklyNow(workspaceName: string): Promise<void> {
  const { createDb, schema } = await import('@adxlens/db');
  const { eq } = await import('drizzle-orm');
  const { generateWeeklyActions, weeklyActionsWeek } = await import('@adxlens/core/recommendation');
  const { db, close } = createDb(process.env.DATABASE_URL!);
  try {
    const [ws] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.name, workspaceName));
    await generateWeeklyActions({ db, workspaceId: ws!.id }, weeklyActionsWeek(ws!.defaultTimezone, new Date()));
  } finally {
    await close();
  }
}

/** Đặt gói cho workspace (thay cho thanh toán ở E2E) — gọi đúng hàm core, chỉ DB local của E2E. */
export async function setPlanNow(workspaceName: string, planKey: 'growth' | 'scale' | 'starter'): Promise<void> {
  const { createDb, schema } = await import('@adxlens/db');
  const { eq } = await import('drizzle-orm');
  const { setSubscription } = await import('@adxlens/core/billing');
  const { db, close } = createDb(process.env.DATABASE_URL!);
  try {
    const [ws] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.name, workspaceName));
    await setSubscription({ db, workspaceId: ws!.id }, { planKey });
  } finally {
    await close();
  }
}

/** Giả lập 14 ngày chạy thử cho mọi rule shadow của workspace (như `pnpm rules:simulate`, chỉ DB local). */
export async function simulateShadowNow(workspaceName: string, days = 14): Promise<void> {
  const { createDb, schema } = await import('@adxlens/db');
  const { and, eq } = await import('drizzle-orm');
  const { simulateShadowDays } = await import('@adxlens/core/execution');
  const { db, close } = createDb(process.env.DATABASE_URL!);
  try {
    const [ws] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.name, workspaceName));
    const rules = await db
      .select()
      .from(schema.automationRules)
      .where(and(eq(schema.automationRules.workspaceId, ws!.id), eq(schema.automationRules.mode, 'shadow')));
    for (const r of rules) await simulateShadowDays({ db, workspaceId: ws!.id }, r.id, days);
  } finally {
    await close();
  }
}

/**
 * Guardrail chặn hành động tự động 22:00–06:00 giờ tài khoản (giữ nguyên, không nới). E2E chạy lúc nào cũng được:
 * đặt múi giờ các tài khoản QC của workspace (chỉ DB local của E2E) sang một múi giờ đang là ban ngày (9–17h).
 */
export async function useDaytimeTimezone(workspaceName: string): Promise<string> {
  const { createDb, schema } = await import('@adxlens/db');
  const { eq } = await import('drizzle-orm');
  const zones = ['Asia/Ho_Chi_Minh', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Pacific/Auckland'];
  const hour = (tz: string) =>
    Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: tz }).format(new Date()));
  const tz = zones.find((z) => hour(z) >= 9 && hour(z) < 17) ?? 'Asia/Ho_Chi_Minh';
  const { db, close } = createDb(process.env.DATABASE_URL!);
  try {
    const [ws] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.name, workspaceName));
    await db.update(schema.adAccounts).set({ timezone: tz }).where(eq(schema.adAccounts.workspaceId, ws!.id));
  } finally {
    await close();
  }
  return tz;
}

/** Đánh giá ngay các rule live (thay cho tick 30 phút); hành động enqueue cho worker E2E thực hiện. */
export async function evaluateLiveRulesNow(workspaceName: string): Promise<void> {
  const { createDb, schema } = await import('@adxlens/db');
  const { and, eq } = await import('drizzle-orm');
  const { liveEvaluate } = await import('@adxlens/core/execution');
  const { bullEnqueue, createQueues, redisConnection } = await import('../../worker/src/queues');
  const { db, close } = createDb(process.env.DATABASE_URL!);
  const connection = redisConnection(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');
  const queues = createQueues(connection);
  try {
    const [ws] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.name, workspaceName));
    const rules = await db
      .select()
      .from(schema.automationRules)
      .where(and(eq(schema.automationRules.workspaceId, ws!.id), eq(schema.automationRules.mode, 'live')));
    for (const r of rules) await liveEvaluate({ db, workspaceId: ws!.id }, r.id, { enqueue: bullEnqueue(queues) });
  } finally {
    await Promise.all(Object.values(queues).map((q) => q.close()));
    await connection.quit();
    await close();
  }
}

/** Tạo workspace khác (B) có một Client — để thử truy cập chéo workspace (implementation-guide 4.4). */
export async function seedForeignClient(): Promise<string> {
  const { createDb } = await import('@adxlens/db');
  const { seedClient, seedWorkspace } = await import('@adxlens/db/testing');
  const { db, close } = createDb(process.env.DATABASE_URL!);
  try {
    const { workspace } = await seedWorkspace(db, `Workspace B ${Date.now()}`);
    return (await seedClient(db, workspace.id, 'Client B bí mật')).id;
  } finally {
    await close();
  }
}
