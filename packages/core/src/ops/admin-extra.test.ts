import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import {
  closeTestDb,
  seedAdAccount,
  seedConnection,
  seedStaff,
  seedWorkspace,
  testDb,
  truncateAll,
} from '@adxlens/db/testing';
import { billingStatus, getPlans, setSubscription } from '@adxlens/core/billing';
import { closeBreakerByStaff } from '@adxlens/core/execution';
import { emailPreviews } from '@adxlens/core/notification';
import {
  activeMaintenanceNotice,
  adminPlans,
  billingOverview,
  compPlan,
  deletionRequestsOverview,
  executionOverview,
  extendGrace,
  listAdminAudit,
  mergeAlertRecipients,
  openIncident,
  opsAlertEmails,
  setMaintenanceNotice,
  setOpsAlertEmails,
  systemHealth,
  updatePlan,
} from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());

const NOW = new Date('2026-10-23T05:00:00Z');
const clock = { now: () => NOW };

async function actors() {
  const sa = await seedStaff(db, true);
  const op = await seedStaff(db, false);
  return {
    sa: { userId: sa.id, role: 'superadmin' as const },
    op: { userId: op.id, role: 'operator' as const },
  };
}
const actions = async () => (await listAdminAudit(db)).map((a) => a.action);

describe('thanh toán (admin)', () => {
  it('superadmin sửa giá (chuỗi số nguyên đồng), không đổi quyền gói; operator → 403; giá sai → 422', async () => {
    const { sa, op } = await actors();
    const input = {
      key: 'growth' as const,
      monthlyPriceVnd: '1490000',
      monthlyPriceUsd: '59.00',
      includedAccounts: 12,
      extraAccountVnd: '69000',
      reason: 'Giá mới quý 4',
    };
    await expect(updatePlan(db, op, input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(updatePlan(db, sa, { ...input, monthlyPriceVnd: '14.9' })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    const entitlementsBefore = (await getPlans(db)).growth.entitlements;
    await updatePlan(db, sa, input);
    const g = (await getPlans(db)).growth;
    expect(g).toMatchObject({
      monthlyPriceVnd: 1490000,
      monthlyPriceUsd: 59,
      includedAccounts: 12,
      extraAccountVnd: 69000,
    });
    expect(g.entitlements).toEqual(entitlementsBefore);
    expect((await adminPlans(db)).find((p) => p.key === 'growth')).toMatchObject({ fromDb: true });
    expect(await actions()).toEqual(['billing.plan_update']);
  });

  it('tặng gói chỉ khi không thanh toán qua cổng; gia hạn ân hạn 1–14 ngày khi đang có ân hạn', async () => {
    const { sa, op } = await actors();
    const { workspace } = await seedWorkspace(db);
    const ctx = { db, workspaceId: workspace.id };
    await expect(
      compPlan(db, op, { workspaceId: workspace.id, planKey: 'growth', reason: 'Design partner' }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await compPlan(db, sa, { workspaceId: workspace.id, planKey: 'growth', reason: 'Design partner' });
    expect((await billingStatus(ctx)).subscribedPlan).toBe('growth');

    await expect(
      extendGrace(db, sa, { workspaceId: workspace.id, days: 7, reason: 'Khách xin thêm' }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    const since = new Date(NOW.getTime() - 6 * 86_400_000);
    await setSubscription(ctx, { planKey: 'growth', status: 'past_due', provider: 'stripe', pastDueSince: since });
    await expect(
      compPlan(db, sa, { workspaceId: workspace.id, planKey: 'scale', reason: 'Tặng thêm' }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    await expect(
      extendGrace(db, sa, { workspaceId: workspace.id, days: 30, reason: 'Khách xin thêm' }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    await extendGrace(db, sa, { workspaceId: workspace.id, days: 7, reason: 'Khách xin thêm' });
    const [sub] = await db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.workspaceId, workspace.id));
    expect(sub!.pastDueSince!.getTime()).toBe(since.getTime() + 7 * 86_400_000);
    const o = await billingOverview(db);
    expect(o.attention.map((a) => a.workspaceId)).toEqual([workspace.id]);
    expect(await actions()).toEqual(['billing.extend_grace', 'billing.comp_plan']);
  });
});

describe('xóa dữ liệu, thực thi (admin)', () => {
  it('yêu cầu xóa quá hạn khi qua hạn > 1 ngày mà chưa xong', async () => {
    const { workspace, owner } = await seedWorkspace(db);
    const conn = await seedConnection(db, workspace.id, owner.id);
    const base = { workspaceId: workspace.id, connectionId: conn.id, source: 'user' as const, metaUserId: 'u1' };
    await db.insert(schema.deletionRequests).values([
      { ...base, code: 'XD-A', status: 'pending', purgeAfter: new Date(NOW.getTime() - 3 * 86_400_000) },
      { ...base, code: 'XD-B', status: 'pending', purgeAfter: new Date(NOW.getTime() + 86_400_000) },
      { ...base, code: 'XD-C', status: 'done', purgeAfter: new Date(NOW.getTime() - 9 * 86_400_000), completedAt: NOW },
    ]);
    const rows = await deletionRequestsOverview(db, clock);
    expect(Object.fromEntries(rows.map((r) => [r.code, r.overdue]))).toEqual({
      'XD-A': true,
      'XD-B': false,
      'XD-C': false,
    });
  });

  it('breaker mở hiện ở tổng quan; chỉ superadmin đóng (có lý do), có nhật ký; breaker đã đóng → 404', async () => {
    const { sa, op } = await actors();
    const { workspace, owner } = await seedWorkspace(db);
    const conn = await seedConnection(db, workspace.id, owner.id);
    const acc = await seedAdAccount(db, workspace.id, conn.id, { name: 'Cà phê Nhà Rang' });
    await db
      .insert(schema.circuitBreakers)
      .values({ adAccountId: acc.id, workspaceId: workspace.id, consecutiveFailures: 3, open: true, openedAt: NOW });
    expect((await executionOverview(db, clock)).breakers).toEqual([
      expect.objectContaining({ adAccountId: acc.id, accountName: 'Cà phê Nhà Rang', consecutiveFailures: 3 }),
    ]);
    const input = { workspaceId: workspace.id, adAccountId: acc.id, reason: 'Đã kiểm Ads Manager' };
    await expect(closeBreakerByStaff(db, op, input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(closeBreakerByStaff(db, sa, { ...input, reason: 'x' })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    await closeBreakerByStaff(db, sa, input);
    expect((await executionOverview(db, clock)).breakers).toEqual([]);
    await expect(closeBreakerByStaff(db, sa, input)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await actions()).toEqual(['execution.breaker_close']);
  });
});

describe('hệ thống (admin)', () => {
  it('email cảnh báo: superadmin đặt, gộp với biến môi trường, bỏ trùng; email sai → 422', async () => {
    const { sa, op } = await actors();
    await expect(setOpsAlertEmails(db, op, { emails: ['a@x.vn'], reason: 'Thêm người trực' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(
      setOpsAlertEmails(db, sa, { emails: ['khong-phai-email'], reason: 'Thêm người trực' }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    await setOpsAlertEmails(db, sa, { emails: ['Truc@X.vn', 'truc@x.vn', 'b@x.vn'], reason: 'Thêm người trực' });
    expect(await opsAlertEmails(db)).toEqual(['truc@x.vn', 'b@x.vn']);
    expect(mergeAlertRecipients('ops@x.vn, truc@x.vn', await opsAlertEmails(db))).toEqual([
      'ops@x.vn',
      'truc@x.vn',
      'b@x.vn',
    ]);
  });

  it('thông báo bảo trì: cần đủ vi/en khi bật, hết hạn theo endsAt, tắt được', async () => {
    const { sa } = await actors();
    const base = { messageVi: 'Bảo trì 22:00–23:00', messageEn: 'Maintenance 22:00–23:00', reason: 'Nâng cấp DB' };
    await expect(
      setMaintenanceNotice(db, sa, { ...base, messageEn: '', active: true, endsAt: null }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    await setMaintenanceNotice(db, sa, { ...base, active: true, endsAt: '2026-10-23T06:00:00Z' }, clock);
    expect(await activeMaintenanceNotice(db, clock)).toMatchObject({ messageVi: 'Bảo trì 22:00–23:00' });
    expect(await activeMaintenanceNotice(db, { now: () => new Date('2026-10-23T07:00:00Z') })).toBeNull();
    await setMaintenanceNotice(db, sa, { ...base, active: false, endsAt: null }, clock);
    expect(await activeMaintenanceNotice(db, clock)).toBeNull();
    expect(await actions()).toEqual(['settings.maintenance_off', 'settings.maintenance_on']);
  });

  it('sức khỏe: sự cố mở theo mức, lịch trễ khi quá 5 phút chưa chạy', async () => {
    await openIncident(db, {
      kind: 'worker_stuck',
      severity: 'P2',
      source: 'health_check',
      title: 'Kẹt',
      fingerprint: 'worker_stuck',
    });
    const h = await systemHealth(
      db,
      {
        appVersion: 'v1',
        schedules: [
          {
            queue: 'ops',
            name: 'ops:health_check',
            pattern: null,
            everyMs: 300000,
            next: new Date(NOW.getTime() - 600_000),
          },
          {
            queue: 'maintenance',
            name: 'maintenance:daily_tick',
            pattern: '0 2 * * *',
            everyMs: null,
            next: new Date(NOW.getTime() + 60_000),
          },
        ],
      },
      clock,
    );
    expect(h.openIncidents).toEqual({ P1: 0, P2: 1, P3: 0 });
    expect(h.executionCheck).toBeNull();
    expect(h.schedules!.map((s) => [s.name, s.late])).toEqual([
      ['ops:health_check', true],
      ['maintenance:daily_tick', false],
    ]);
  });

  it('xem trước email: mọi mẫu dựng được bằng dữ liệu mẫu, cả vi và en', () => {
    for (const locale of ['vi', 'en'] as const) {
      const all = emailPreviews(locale);
      expect(all.length).toBeGreaterThanOrEqual(10);
      for (const p of all) {
        expect(p.message.subject.length).toBeGreaterThan(0);
        expect(p.message.html).toContain('<');
      }
    }
  });
});
