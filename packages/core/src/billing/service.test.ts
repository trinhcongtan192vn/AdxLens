import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@adxlens/db';
import {
  closeTestDb,
  seedAdAccount,
  seedConnection,
  seedMember,
  seedStaff,
  seedWorkspace,
  testDb,
  truncateAll,
} from '@adxlens/db/testing';
import { createWorkspace, resolveActor } from '@adxlens/core/tenancy';
import {
  activeAccountCount,
  assertCanCreateWorkspace,
  ownedFreeWorkspaceCount,
  billingStatus,
  currentPlanKey,
  getPlans,
  hasPlanEntitlement,
  refreshOverLimit,
  setSubscription,
  showPoweredBy,
  syncableAccountIds,
} from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());

const T0 = new Date('2026-10-23T03:00:00Z');
const at = (days: number) => ({ now: () => new Date(T0.getTime() + days * 86_400_000) });

async function setup() {
  const { workspace, owner } = await seedWorkspace(db);
  const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
  const conn = await seedConnection(db, workspace.id, owner.id);
  const addAccounts = async (n: number, active = true) => {
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const a = await seedAdAccount(db, workspace.id, conn.id);
      await db.update(schema.adAccounts).set({ active30d: active }).where(eq(schema.adAccounts.id, a.id));
      ids.push(a.id);
    }
    return ids;
  };
  return { ctx, conn, addAccounts, workspaceId: workspace.id };
}

describe('gói cấu hình trong DB (026)', () => {
  it('đọc giá từ bảng; thiếu dòng thì dùng mặc định trong code', async () => {
    expect((await getPlans(db)).growth.includedAccounts).toBe(15);
    await db.insert(schema.billingPlans).values({
      key: 'growth',
      monthlyPriceVnd: '1590000',
      includedAccounts: 20,
      extraAccountVnd: '69000',
      entitlements: ['reports', 'write_actions'],
    });
    const plans = await getPlans(db);
    expect(plans.growth).toMatchObject({ monthlyPriceVnd: 1_590_000, includedAccounts: 20, extraAccountVnd: 69_000 });
    expect(plans.starter.includedAccounts).toBe(5);
  });

  it('gói không còn active thì về mặc định', async () => {
    await db.insert(schema.billingPlans).values({
      key: 'starter',
      monthlyPriceVnd: '1',
      includedAccounts: 99,
      entitlements: [],
      active: false,
    });
    expect((await getPlans(db)).starter.includedAccounts).toBe(5);
  });
});

describe('tài khoản đang hoạt động (PRD 13.3)', () => {
  it('chỉ đếm tài khoản có chi tiêu 30 ngày, bỏ tài khoản mẫu và kết nối đã thu hồi', async () => {
    const { ctx, conn, addAccounts, workspaceId } = await setup();
    await addAccounts(2);
    await addAccounts(1, false);
    expect(await activeAccountCount(ctx)).toBe(2);
    await db.update(schema.metaConnections).set({ isDemo: true }).where(eq(schema.metaConnections.id, conn.id));
    expect(await activeAccountCount(ctx)).toBe(0);
    await db
      .update(schema.metaConnections)
      .set({ isDemo: false, status: 'revoked' })
      .where(eq(schema.metaConnections.workspaceId, workspaceId));
    expect(await activeAccountCount(ctx)).toBe(0);
  });

  it('không đếm tài khoản của workspace khác', async () => {
    const a = await setup();
    const b = await setup();
    await b.addAccounts(3);
    expect(await activeAccountCount(a.ctx)).toBe(0);
  });
});

describe('gói và quyền theo gói', () => {
  it('workspace mới ở Free (ADR-0001 A5); đổi gói thì quyền đổi theo', async () => {
    const { ctx } = await setup();
    expect(await currentPlanKey(ctx)).toBe('free');
    expect(await hasPlanEntitlement(ctx, 'write_actions')).toBe(false);
    await setSubscription(ctx, { planKey: 'growth' });
    expect(await currentPlanKey(ctx)).toBe('growth');
    expect(await hasPlanEntitlement(ctx, 'write_actions')).toBe(true);
    expect(await hasPlanEntitlement(ctx, 'remove_badge')).toBe(false);
  });

  it('past_due: còn ân hạn 7 ngày giữ gói, hết ân hạn về Free', async () => {
    const { ctx } = await setup();
    await setSubscription(ctx, { planKey: 'growth', status: 'past_due', pastDueSince: T0 });
    expect(await currentPlanKey(ctx, at(6))).toBe('growth');
    const s = await billingStatus(ctx, at(6));
    expect(s.graceUntil?.toISOString()).toBe(new Date(T0.getTime() + 7 * 86_400_000).toISOString());
    expect(await currentPlanKey(ctx, at(7))).toBe('free');
    expect((await billingStatus(ctx, at(8))).subscribedPlan).toBe('growth');
  });

  it('gói đã hủy về Free', async () => {
    const { ctx } = await setup();
    await setSubscription(ctx, { planKey: 'scale', status: 'canceled' });
    expect(await currentPlanKey(ctx)).toBe('free');
  });

  it('nhãn Powered by: ẩn với gói có remove_badge hoặc workspace được gỡ thủ công', async () => {
    const { ctx, workspaceId } = await setup();
    expect(await showPoweredBy(ctx)).toBe(true);
    await setSubscription(ctx, { planKey: 'scale' });
    expect(await showPoweredBy(ctx)).toBe(false);
    await setSubscription(ctx, { planKey: 'starter' });
    expect(await showPoweredBy(ctx)).toBe(true);
    await db.update(schema.workspaces).set({ badgeRemoved: true }).where(eq(schema.workspaces.id, workspaceId));
    expect(await showPoweredBy(ctx)).toBe(false);
  });
});

describe('vượt hạn mức + ân hạn 7 ngày (ADR-0001 A8)', () => {
  it('trong hạn mức: không ghi mốc, đồng bộ mọi tài khoản', async () => {
    const { ctx, addAccounts } = await setup();
    await addAccounts(1);
    expect(await refreshOverLimit(ctx, at(0))).toBe('ok');
    expect(await syncableAccountIds(ctx, at(30))).toBeNull();
    expect((await billingStatus(ctx)).overLimit).toBe(false);
  });

  it('vượt: ghi mốc một lần; trong ân hạn vẫn đồng bộ hết; hết ân hạn chỉ giữ tài khoản nhập sớm nhất', async () => {
    const { ctx, addAccounts } = await setup();
    const ids = await addAccounts(3);
    expect(await refreshOverLimit(ctx, at(0))).toBe('over');
    await refreshOverLimit(ctx, at(3)); // không dời mốc
    const s = await billingStatus(ctx, at(3));
    expect(s.overLimit).toBe(true);
    expect(s.graceExpired).toBe(false);
    expect(s.graceUntil?.toISOString()).toBe(new Date(T0.getTime() + 7 * 86_400_000).toISOString());
    expect(await syncableAccountIds(ctx, at(6))).toBeNull();
    const allowed = await syncableAccountIds(ctx, at(7));
    expect(allowed && [...allowed]).toEqual([ids[0]]);
  });

  it('hết vượt (nâng gói) thì xóa mốc và bỏ giới hạn', async () => {
    const { ctx, addAccounts } = await setup();
    await addAccounts(3);
    await refreshOverLimit(ctx, at(0));
    await setSubscription(ctx, { planKey: 'starter' });
    expect(await refreshOverLimit(ctx, at(10))).toBe('ok');
    const [sub] = await db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.workspaceId, ctx.workspaceId));
    expect(sub?.overLimitSince).toBeNull();
    expect(await syncableAccountIds(ctx, at(10))).toBeNull();
  });

  it('mỗi user sở hữu tối đa 1 workspace Free; nâng cấp hoặc chỉ là thành viên thì không tính; staff không giới hạn', async () => {
    const { ctx, workspaceId } = await setup();
    const owner = ctx.actor.userId;
    expect(await ownedFreeWorkspaceCount(db, owner)).toBe(1);
    await expect(assertCanCreateWorkspace(db, owner)).rejects.toMatchObject({
      code: 'PLAN_REQUIRED',
      details: { reason: 'free_workspace_limit' },
    });
    // Nâng cấp workspace hiện có → được tạo thêm 1 workspace Free.
    await setSubscription(ctx, { planKey: 'starter' });
    expect(await ownedFreeWorkspaceCount(db, owner)).toBe(0);
    await assertCanCreateWorkspace(db, owner);
    await createWorkspace(db, { name: 'Agency 2', ownerUserId: owner });
    await expect(assertCanCreateWorkspace(db, owner)).rejects.toMatchObject({ code: 'PLAN_REQUIRED' });
    // Hủy gói → workspace đó lại tính là Free.
    await db
      .update(schema.subscriptions)
      .set({ status: 'canceled' })
      .where(eq(schema.subscriptions.workspaceId, workspaceId));
    expect(await ownedFreeWorkspaceCount(db, owner)).toBe(2);
    // Chỉ là manager ở workspace Free của người khác → không tính; user mới tạo được workspace đầu tiên.
    const manager = await seedMember(db, workspaceId, 'manager');
    expect(await ownedFreeWorkspaceCount(db, manager.id)).toBe(0);
    await assertCanCreateWorkspace(db, manager.id);
    const staff = await seedStaff(db, false);
    await createWorkspace(db, { name: 'Staff WS', ownerUserId: staff.id });
    await assertCanCreateWorkspace(db, staff.id);
  });
});
