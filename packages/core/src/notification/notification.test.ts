import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeTestDb, seedClient, seedMember, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { recordingEnqueue } from '@adxlens/jobs';
import {
  ALERT_EMAIL_KINDS,
  getNotificationSettings,
  listNotifications,
  markRead,
  memoryEmailSender,
  NOTIFICATION_KIND_LIST,
  notify,
  sendNotificationEmail,
  unreadCount,
  updateNotificationSettings,
} from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());

async function team() {
  const { workspace, owner } = await seedWorkspace(db);
  const ws = workspace.id;
  const linh = await seedClient(db, ws, 'Linh');
  const other = await seedClient(db, ws, 'Khác');
  const managerAll = await seedMember(db, ws, 'manager');
  const managerOther = await seedMember(db, ws, 'manager', [other.id]);
  const buyerLinh = await seedMember(db, ws, 'buyer', [linh.id]);
  return { ctx: { db, workspaceId: ws }, owner, managerAll, managerOther, buyerLinh, linh };
}

describe('gửi thông báo (P0-25)', () => {
  it('người nhận theo vai trò + quyền Client; email chỉ khi bật; chống trùng', async () => {
    const { ctx, owner, managerAll, managerOther, buyerLinh, linh } = await team();
    const enqueue = recordingEnqueue();
    const r = await notify(
      ctx,
      {
        kind: 'reconciliation_warning',
        recipients: { roles: ['owner', 'manager'], clientId: linh.id },
        params: { account: 'Linh 01', dates: '20/10' },
        link: '/clients/x/reconciliation',
        dedupeKey: 'recon:a:2026-10-20',
      },
      { enqueue },
    );
    // owner + manager không giới hạn; manager chỉ xem Client khác bị loại; buyer không thuộc vai trò.
    expect(r).toEqual({ created: 2, emailed: 2 });
    expect(await unreadCount(ctx, owner.id)).toBe(1);
    expect(await unreadCount(ctx, managerAll.id)).toBe(1);
    expect(await unreadCount(ctx, managerOther.id)).toBe(0);
    expect(await unreadCount(ctx, buyerLinh.id)).toBe(0);
    expect(enqueue.calls.every((c) => c.name === 'notify:send_email')).toBe(true);

    const again = await notify(
      ctx,
      { kind: 'reconciliation_warning', recipients: { roles: ['owner'] }, params: {}, dedupeKey: 'recon:a:2026-10-20' },
      { enqueue },
    );
    expect(again.created).toBe(0);
  });

  it('cài đặt: loại thường theo người dùng; loại bắt buộc luôn bật', async () => {
    const { ctx, owner } = await team();
    const enqueue = recordingEnqueue();
    // Mặc định sync_done: trong app, không email.
    expect(
      await notify(
        ctx,
        { kind: 'sync_done', recipients: { userIds: [owner.id] }, params: { account: 'A' } },
        { enqueue },
      ),
    ).toEqual({
      created: 1,
      emailed: 0,
    });
    await updateNotificationSettings(ctx, owner.id, [
      { kind: 'sync_done', inApp: false, email: true },
      { kind: 'reconciliation_warning', inApp: false, email: false },
    ]);
    const s = await getNotificationSettings(ctx, owner.id);
    expect(s.find((x) => x.kind === 'sync_done')).toMatchObject({ inApp: false, email: true });
    expect(s.find((x) => x.kind === 'reconciliation_warning')).toMatchObject({
      mandatory: true,
      inApp: true,
      email: true,
    });
    const r = await notify(
      ctx,
      { kind: 'sync_done', recipients: { userIds: [owner.id] }, params: { account: 'B' } },
      { enqueue },
    );
    expect(r).toEqual({ created: 1, emailed: 1 });
    // Không bật trong app → không tính chưa đọc.
    expect(await unreadCount(ctx, owner.id)).toBe(1);
    // email: false buộc không gửi email (playbook đã gửi).
    expect(
      (await notify(ctx, { kind: 'token_expired', recipients: { userIds: [owner.id] }, email: false }, { enqueue }))
        .emailed,
    ).toBe(0);
  });

  it('gửi email theo locale người nhận, ghi trạng thái; đánh dấu đã đọc chỉ của mình', async () => {
    const { ctx, owner, managerAll } = await team();
    const enqueue = recordingEnqueue();
    await notify(
      ctx,
      { kind: 'token_expiring', recipients: { userIds: [owner.id] }, params: { days: 3 }, link: '/connections' },
      { enqueue },
    );
    const id = (enqueue.calls[0]!.payload as { notificationId: string }).notificationId;
    const email = memoryEmailSender();
    expect(await sendNotificationEmail(ctx, id, { email, appUrl: 'http://app' })).toBe('sent');
    expect(email.sent[0]).toMatchObject({ to: owner.email, subject: 'Kết nối Meta hết hạn sau 3 ngày' });
    expect(email.sent[0]!.text).toContain('http://app/connections');
    expect(await sendNotificationEmail(ctx, id, { email, appUrl: 'http://app' })).toBe('skipped');
    expect((await listNotifications(ctx, owner.id))[0]!.emailStatus).toBe('sent');

    await expect(markRead(ctx, managerAll.id, id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await markRead(ctx, owner.id, id)).toBe(1);
    expect(await unreadCount(ctx, owner.id)).toBe(0);
  });

  it('mọi loại thông báo có mẫu email vi/en', () => {
    expect([...ALERT_EMAIL_KINDS].sort()).toEqual([...NOTIFICATION_KIND_LIST].sort());
  });
});
