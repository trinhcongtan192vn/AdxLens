import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@adxlens/db';
import { closeTestDb, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { recordingEnqueue } from '@adxlens/jobs';
import { MOCK_ACCOUNTS, MockMetaRead } from '@adxlens/meta-client/mock';
import {
  assignAdAccount,
  importAccounts,
  keysFromEnv,
  saveConnection,
  unassignAdAccount,
} from '@adxlens/core/connections';
import { startBackfill, syncRange } from '@adxlens/core/ingestion';
import { memoryEmailSender } from '@adxlens/core/notification';
import { reconcileAccount } from '@adxlens/core/reconciliation';
import { resolveActor } from '@adxlens/core/tenancy';
import {
  approveDelivery,
  createSchedule,
  isDue,
  listSchedules,
  periodFromKey,
  runSchedule,
  schedulePeriod,
} from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());
const KEYS = keysFromEnv({ TOKEN_ENC_KEY_V1: Buffer.alloc(32, 14).toString('base64') });
// Thứ Hai 26/10/2026 09:10 giờ Việt Nam.
const now = () => new Date('2026-10-26T02:10:00Z');
const clock = { now };
const meta = new MockMetaRead(now);

describe('kỳ và giờ chạy lịch', () => {
  const weekly = {
    cadence: 'weekly' as const,
    weekday: 1,
    monthDay: null,
    sendHour: 9,
    timezone: 'Asia/Ho_Chi_Minh',
    enabled: true,
  };
  it('tuần: chạy thứ Hai 9 giờ, kỳ = tuần trước (thứ Hai–Chủ nhật)', () => {
    expect(isDue(weekly, now())).toBe(true);
    expect(isDue({ ...weekly, sendHour: 8 }, now())).toBe(false);
    expect(isDue({ ...weekly, weekday: 2 }, now())).toBe(false);
    expect(isDue({ ...weekly, enabled: false }, now())).toBe(false);
    expect(schedulePeriod(weekly, now())).toEqual({ key: '2026-W43', from: '2026-10-19', to: '2026-10-25' });
    expect(periodFromKey('2026-W43')).toEqual({ from: '2026-10-19', to: '2026-10-25' });
  });
  it('tháng: chạy đúng ngày, kỳ = tháng trước; múi giờ của lịch', () => {
    const monthly = {
      cadence: 'monthly' as const,
      weekday: null,
      monthDay: 26,
      sendHour: 9,
      timezone: 'Asia/Ho_Chi_Minh',
      enabled: true,
    };
    expect(isDue(monthly, now())).toBe(true);
    expect(schedulePeriod(monthly, now())).toEqual({ key: '2026-09', from: '2026-09-01', to: '2026-09-30' });
    expect(periodFromKey('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    // 02:10Z = 19:10 Chủ nhật ở Los Angeles → không phải thứ Hai 9 giờ.
    expect(isDue({ ...weekly, timezone: 'America/Los_Angeles' }, now())).toBe(false);
  });
});

async function clientReady(confirm = true) {
  const { workspace, owner } = await seedWorkspace(db);
  const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
  const { connectionId } = await saveConnection(
    ctx,
    { token: 'mock-read-sc', expiresAt: null, scopes: ['ads_read'], metaUser: { id: 'sc' }, accounts: MOCK_ACCOUNTS },
    KEYS,
  );
  const [a] = await importAccounts(ctx, { connectionId, metaAccountIds: ['act_100000001'] });
  const enqueue = recordingEnqueue();
  await startBackfill(ctx, a!.adAccountId, { enqueue, clock });
  await syncRange(ctx, enqueue.calls[0]!.payload as never, { meta, keys: KEYS.keys, clock });
  await reconcileAccount(
    ctx,
    { adAccountId: a!.adAccountId, from: '2026-10-19', to: '2026-10-25' },
    { meta, keys: KEYS.keys, clock },
  );
  const { clientId } = await assignAdAccount(ctx, a!.adAccountId, { createClientName: 'Linh' });
  if (!confirm) {
    await unassignAdAccount(ctx, a!.adAccountId);
    await db.update(schema.adAccounts).set({ clientId }).where(eq(schema.adAccounts.id, a!.adAccountId));
  }
  return { ctx, clientId: clientId!, owner };
}

const base = (clientId: string) => ({
  clientId,
  cadence: 'weekly' as const,
  weekday: 1,
  sendHour: 9,
  timezone: 'Asia/Ho_Chi_Minh',
  mode: 'auto' as const,
  delivery: 'link' as const,
  recipients: ['khach@linh.vn', ' Khach@Linh.vn ', 'sep@linh.vn'],
});

describe('lịch gửi báo cáo (R05, P0-17, P0-24)', () => {
  it('tạo: chuẩn hóa email, chặn cấu hình sai', async () => {
    const { ctx, clientId } = await clientReady();
    const s = await createSchedule(ctx, base(clientId));
    expect(s.recipients).toEqual(['khach@linh.vn', 'sep@linh.vn']);
    await expect(createSchedule(ctx, { ...base(clientId), weekday: 9 })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    await expect(createSchedule(ctx, { ...base(clientId), recipients: ['khong-phai-email'] })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    await expect(createSchedule(ctx, { ...base(clientId), timezone: 'Mars/Base' })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it('tự động: dựng báo cáo kỳ, gửi link công khai tới từng người nhận; chạy lại kỳ đó → bỏ qua', async () => {
    const { ctx, clientId, owner } = await clientReady();
    const s = await createSchedule(ctx, base(clientId));
    const email = memoryEmailSender();
    const enqueue = recordingEnqueue();
    const deps = { email, publicReportUrl: 'http://app/r', enqueue, clock };
    expect(await runSchedule(ctx, { scheduleId: s.id, period: '2026-W43' }, deps)).toBe('sent');
    expect(email.sent.map((m) => m.to)).toEqual(['khach@linh.vn', 'sep@linh.vn']);
    expect(email.sent[0]!.subject).toContain('Linh — Báo cáo Meta Ads 19/10 – 25/10/2026');
    expect(email.sent[0]!.text).toMatch(/http:\/\/app\/r\/[A-Za-z0-9_-]{43}/);
    expect(email.sent[0]!.attachments).toBeUndefined();
    const [d] = (await listSchedules(ctx))[0]!.deliveries;
    expect(d).toMatchObject({ period: '2026-W43', status: 'sent' });
    const links = await db.select().from(schema.shareLinks);
    expect(links[0]!.expiresAt).toEqual(new Date(now().getTime() + 30 * 86_400_000));
    const sent = await db.select().from(schema.notifications).where(eq(schema.notifications.kind, 'report_sent'));
    expect(sent).toMatchObject([{ userId: owner.id }]);
    expect(await runSchedule(ctx, { scheduleId: s.id, period: '2026-W43' }, deps)).toBe('skipped');
    expect(email.sent).toHaveLength(2);
  });

  it('PDF: đính kèm PDF do worker render', async () => {
    const { ctx, clientId } = await clientReady();
    const s = await createSchedule(ctx, { ...base(clientId), delivery: 'pdf', recipients: ['khach@linh.vn'] });
    const email = memoryEmailSender();
    const rendered: string[] = [];
    await runSchedule(
      ctx,
      { scheduleId: s.id, period: '2026-W43' },
      {
        email,
        publicReportUrl: 'http://app/r',
        clock,
        renderPdf: async (id) => {
          rendered.push(id);
          return new Uint8Array([37, 80, 68, 70]);
        },
      },
    );
    expect(rendered).toHaveLength(1);
    expect(email.sent[0]!.attachments).toMatchObject([
      { filename: 'Linh-2026-W43.pdf', contentType: 'application/pdf' },
    ]);
  });

  it('chưa xác nhận gán → hoãn, không gửi khách, báo account manager kèm lý do (bắt buộc, có email)', async () => {
    const { ctx, clientId } = await clientReady(false);
    const s = await createSchedule(ctx, base(clientId));
    const email = memoryEmailSender();
    const enqueue = recordingEnqueue();
    expect(
      await runSchedule(
        ctx,
        { scheduleId: s.id, period: '2026-W43' },
        { email, publicReportUrl: 'http://app/r', enqueue, clock },
      ),
    ).toBe('postponed');
    expect(email.sent).toEqual([]);
    expect(await db.select().from(schema.shareLinks)).toEqual([]);
    const [d] = (await listSchedules(ctx))[0]!.deliveries;
    expect(d).toMatchObject({ status: 'postponed', reason: 'unconfirmed' });
    const notes = await db.select().from(schema.notifications).where(eq(schema.notifications.kind, 'report_postponed'));
    expect(notes[0]).toMatchObject({ params: { reason: 'unconfirmed' }, emailStatus: 'queued' });
  });

  it('cần duyệt: chờ duyệt → duyệt → gửi ở lần chạy kế (kiểm toàn vẹn lại)', async () => {
    const { ctx, clientId } = await clientReady();
    const s = await createSchedule(ctx, { ...base(clientId), mode: 'approval' });
    const email = memoryEmailSender();
    const enqueue = recordingEnqueue();
    const deps = { email, publicReportUrl: 'http://app/r', enqueue, clock };
    expect(await runSchedule(ctx, { scheduleId: s.id, period: '2026-W43' }, deps)).toBe('pending_approval');
    expect(email.sent).toEqual([]);
    expect(
      (await db.select().from(schema.notifications).where(eq(schema.notifications.kind, 'report_needs_approval')))
        .length,
    ).toBe(1);
    const [d] = (await listSchedules(ctx))[0]!.deliveries;
    await approveDelivery(ctx, d!.id, { enqueue });
    expect(enqueue.calls.at(-1)).toMatchObject({
      name: 'notify:scheduled_report',
      payload: { scheduleId: s.id, period: '2026-W43' },
    });
    await expect(approveDelivery(ctx, d!.id, { enqueue })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(await runSchedule(ctx, { scheduleId: s.id, period: '2026-W43' }, deps)).toBe('sent');
    // 2 người nhận (đã bỏ trùng).
    expect(email.sent).toHaveLength(2);
    // Báo cáo đã dựng lúc chờ duyệt được dùng lại (không dựng lần hai).
    expect(await db.select().from(schema.reports)).toHaveLength(1);
  });
});
