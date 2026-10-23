import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import { closeTestDb, seedStaff, seedUser, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { asUser, call, installTestServer, uninstallTestServer } from '../../../../test-utils';
import * as audit from './audit/route';
import * as proposal from './flag-proposals/[id]/route';
import * as proposals from './flag-proposals/route';
import * as killSwitch from './kill-switch/route';
import * as staffOne from './staff/[userId]/route';
import * as staffList from './staff/route';

const db = testDb();
beforeEach(async () => {
  await truncateAll(db);
  installTestServer(db);
});
afterEach(() => uninstallTestServer());
afterAll(() => closeTestDb());

type AuditItem = { action: string; actor_email: string | null; reason: string | null };
const auditItems = async (user: ReturnType<typeof asUser>) =>
  ((await call(audit.GET, { user })).body as { items: AuditItem[] }).items;

describe('quản lý staff (ADR-0013)', () => {
  it('người ngoài → 404; operator xem được nhưng không thêm / đổi / gỡ; superadmin làm được, có nhật ký', async () => {
    const { owner } = await seedWorkspace(db);
    expect((await call(staffList.GET, { user: asUser(owner) })).status).toBe(404);
    const op = await seedStaff(db, false);
    const sa = await seedStaff(db, true);
    const target = await seedUser(db);

    const list = await call(staffList.GET, { user: asUser(op) });
    expect(list.body).toMatchObject({ me: { role: 'operator' } });
    expect((list.body as { items: unknown[] }).items).toHaveLength(2);

    const body = { email: target.email, role: 'operator', reason: 'Thêm người trực' };
    expect((await call(staffList.POST, { user: asUser(op), body })).status).toBe(403);
    expect((await call(staffList.POST, { user: asUser(sa), body })).body).toMatchObject({ role: 'operator' });
    expect((await call(staffList.POST, { user: asUser(sa), body })).status).toBe(409);
    const nobody = { email: 'chua-co@x.vn', role: 'operator', reason: 'Thêm người trực' };
    expect((await call(staffList.POST, { user: asUser(sa), body: nobody })).status).toBe(404);

    const promote = { role: 'superadmin', reason: 'Lên trưởng ca' };
    expect(
      (await call(staffOne.PATCH, { user: asUser(op), params: { userId: target.id }, body: promote })).status,
    ).toBe(403);
    expect(
      (await call(staffOne.PATCH, { user: asUser(sa), params: { userId: target.id }, body: promote })).body,
    ).toMatchObject({ role: 'superadmin' });
    const [row] = await db.select().from(schema.staff).where(eq(schema.staff.userId, target.id));
    expect(row).toMatchObject({ role: 'superadmin', canEnableFlags: true });

    const del = await call(staffOne.DELETE, {
      user: asUser(sa),
      params: { userId: target.id },
      path: `/api/test?reason=${encodeURIComponent('Nghỉ việc')}`,
    });
    expect(del.status).toBe(204);

    const items = await auditItems(asUser(sa));
    expect(items.map((i) => i.action)).toEqual(['staff.remove', 'staff.role', 'staff.add']);
    expect(items.every((i) => i.actor_email === sa.email)).toBe(true);
    // Operator chỉ thấy dòng của chính mình.
    expect(await auditItems(asUser(op))).toEqual([]);
  });

  it('không tự đổi / gỡ mình (superadmin cuối cùng luôn còn); operator không hạ được superadmin', async () => {
    const sa = await seedStaff(db, true);
    const sa2 = await seedStaff(db, true);
    const demote = { role: 'operator', reason: 'Giảm quyền' };
    const path = `/api/test?reason=${encodeURIComponent('Gỡ quyền')}`;
    expect((await call(staffOne.PATCH, { user: asUser(sa), params: { userId: sa.id }, body: demote })).status).toBe(
      409,
    );
    expect((await call(staffOne.DELETE, { user: asUser(sa), params: { userId: sa.id }, path })).status).toBe(409);
    expect((await call(staffOne.PATCH, { user: asUser(sa), params: { userId: sa2.id }, body: demote })).status).toBe(
      200,
    );
    // sa2 giờ là operator: không hạ / gỡ được sa (superadmin cuối cùng).
    expect((await call(staffOne.PATCH, { user: asUser(sa2), params: { userId: sa.id }, body: demote })).status).toBe(
      403,
    );
    expect((await call(staffOne.DELETE, { user: asUser(sa2), params: { userId: sa.id }, path })).status).toBe(403);
    const roles = await db.select({ role: schema.staff.role }).from(schema.staff).where(eq(schema.staff.userId, sa.id));
    expect(roles).toEqual([{ role: 'superadmin' }]);
  });

  it('nhật ký admin chỉ thêm: không sửa, không xóa được', async () => {
    const sa = await seedStaff(db, true);
    await call(killSwitch.POST, { user: asUser(sa), body: { active: true, reason: 'Diễn tập dừng' } });
    await expect(db.execute(sql`update app.admin_audit_log set reason = 'sửa'`)).rejects.toThrow();
    await expect(db.execute(sql`delete from app.admin_audit_log`)).rejects.toThrow();
    expect((await auditItems(asUser(sa))).map((i) => i.action)).toEqual(['kill_switch.on']);
  });
});

describe('đề xuất bật cờ (ADR-0013)', () => {
  it('operator đề xuất → không trùng; superadmin duyệt → cờ bật qua core/flags (checklist vẫn chạy)', async () => {
    const { workspace } = await seedWorkspace(db);
    const op = asUser(await seedStaff(db, false));
    const sa = asUser(await seedStaff(db, true));
    const body = { workspace_id: workspace.id, flag: 'p0_reports', reason: 'Design partner cần báo cáo' };
    const p = await call(proposals.POST, { user: op, body });
    expect(p.body).toMatchObject({ status: 'pending' });
    expect((await call(proposals.POST, { user: op, body })).status).toBe(409);
    const id = (p.body as { id: string }).id;

    expect((await call(proposal.POST, { user: op, params: { id }, body: { decision: 'approve' } })).status).toBe(403);
    // Checklist p0_reports chưa đạt trên workspace mới: duyệt không vượt → 409, đề xuất vẫn chờ.
    expect((await call(proposal.POST, { user: sa, params: { id }, body: { decision: 'approve' } })).status).toBe(409);
    const ok = await call(proposal.POST, {
      user: sa,
      params: { id },
      body: { decision: 'approve', note: 'Đã kiểm tay', override: true },
    });
    expect(ok.body).toMatchObject({ status: 'approved', override: true });
    const [flag] = await db.select().from(schema.featureFlags).where(eq(schema.featureFlags.workspaceId, workspace.id));
    expect(flag).toMatchObject({ flagKey: 'p0_reports', enabled: true });
    const [log] = await db
      .select()
      .from(schema.flagChangeLog)
      .where(eq(schema.flagChangeLog.workspaceId, workspace.id));
    expect(log).toMatchObject({ newValue: true, override: true });

    const listed = await call(proposals.GET, { user: op, path: '/api/test?status=approved' });
    expect((listed.body as { items: { id: string }[] }).items.map((i) => i.id)).toEqual([id]);
    expect((await auditItems(sa)).map((i) => i.action)).toEqual(['flag.proposal_approve', 'flag.propose']);
  });

  it('từ chối cần superadmin + lý do; người đề xuất tự hủy được, người khác không', async () => {
    const { workspace } = await seedWorkspace(db);
    const op = asUser(await seedStaff(db, false));
    const op2 = asUser(await seedStaff(db, false));
    const sa = asUser(await seedStaff(db, true));
    const mk = async (flag: string) =>
      (
        (await call(proposals.POST, { user: op, body: { workspace_id: workspace.id, flag, reason: 'Khách yêu cầu' } }))
          .body as { id: string }
      ).id;
    const a = await mk('p0_reports');
    expect(
      (
        await call(proposal.POST, {
          user: op,
          params: { id: a },
          body: { decision: 'reject', note: 'Chưa đủ dữ liệu' },
        })
      ).status,
    ).toBe(403);
    expect(
      (await call(proposal.POST, { user: sa, params: { id: a }, body: { decision: 'reject', note: 'x' } })).status,
    ).toBe(422);
    expect(
      (
        await call(proposal.POST, {
          user: sa,
          params: { id: a },
          body: { decision: 'reject', note: 'Chưa đủ dữ liệu' },
        })
      ).body,
    ).toMatchObject({ status: 'rejected' });
    expect((await call(proposal.POST, { user: sa, params: { id: a }, body: { decision: 'approve' } })).status).toBe(
      409,
    );

    const b = await mk('p0_reports');
    const cancel = { decision: 'cancel', note: 'Đề xuất nhầm' };
    expect((await call(proposal.POST, { user: op2, params: { id: b }, body: cancel })).status).toBe(403);
    expect((await call(proposal.POST, { user: op, params: { id: b }, body: cancel })).body).toMatchObject({
      status: 'canceled',
    });
    const flags = await db.select().from(schema.featureFlags).where(eq(schema.featureFlags.workspaceId, workspace.id));
    expect(flags.filter((f) => f.enabled)).toEqual([]);
  });
});
