import { and, eq } from 'drizzle-orm';
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
import { disableFlag, enableFlag, runChecklist } from '@adxlens/core/flags';
import {
  getGlobalKillSwitch,
  listIncidents,
  recordExecutionCheck,
  setGlobalKillSwitch,
  setWorkspaceKillSwitchSystem,
} from '@adxlens/core/ops';
import { resolveActor } from '@adxlens/core/tenancy';
import {
  closeBreaker,
  executionControls,
  GUARDRAIL_DEFAULTS,
  killSwitchState,
  recordFailure,
  registerExecutionHooks,
  saveGuardrails,
  setWorkspaceKillSwitch,
} from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());
registerExecutionHooks({ appVersion: 'test-sha' });

async function setup() {
  const { workspace, owner } = await seedWorkspace(db);
  const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
  const conn = await seedConnection(db, workspace.id, owner.id);
  const acc = await seedAdAccount(db, workspace.id, conn.id, { name: 'TK Kill' });
  const pending = async (tier: 'approve' | 'auto' = 'approve') =>
    (
      await db
        .insert(schema.actions)
        .values({
          workspaceId: workspace.id,
          adAccountId: acc.id,
          actionType: 'pause_ad',
          targetType: 'ad',
          targetMetaId: '1',
          tier,
          params: {},
          beforeState: { status: 'ACTIVE' },
          afterExpected: { status: 'PAUSED' },
          idempotencyKey: `k-${Math.random()}`,
        })
        .returning()
    )[0]!;
  const status = async (id: string) =>
    (await db.select({ s: schema.actions.status }).from(schema.actions).where(eq(schema.actions.id, id)))[0]!.s;
  return { ctx, workspaceId: workspace.id, acc, conn, pending, status };
}

describe('kill switch workspace (P205)', () => {
  it('bật cần lý do, hủy ngay hành động đang chờ, ghi audit; tắt cho phép lại', async () => {
    const s = await setup();
    const p = await s.pending();
    await expect(setWorkspaceKillSwitch(s.ctx, { active: true, reason: 'x' })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect(await setWorkspaceKillSwitch(s.ctx, { active: true, reason: 'Khách yêu cầu dừng' })).toEqual({
      canceled: 1,
    });
    expect(await s.status(p.id)).toBe('canceled');
    expect(await killSwitchState(s.ctx)).toEqual({ global: false, workspace: true });
    expect((await executionControls(s.ctx)).workspace).toMatchObject({ active: true, reason: 'Khách yêu cầu dừng' });
    const audit = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.workspaceId, s.workspaceId));
    expect(audit.map((a) => a.event)).toContain('kill_switch.on');
    await setWorkspaceKillSwitch(s.ctx, { active: false, reason: '' });
    expect((await killSwitchState(s.ctx)).workspace).toBe(false);
  });

  it('chỉ Owner; không ảnh hưởng workspace khác', async () => {
    const a = await setup();
    const b = await setup();
    const m = await seedMember(db, a.workspaceId, 'manager');
    const mctx = { db, workspaceId: a.workspaceId, actor: (await resolveActor(db, a.workspaceId, m.id))! };
    await expect(setWorkspaceKillSwitch(mctx, { active: true, reason: 'thử quyền' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    const pb = await b.pending();
    await setWorkspaceKillSwitch(a.ctx, { active: true, reason: 'chỉ workspace A' });
    expect(await b.status(pb.id)).toBe('pending');
    expect((await killSwitchState(b.ctx)).workspace).toBe(false);
  });

  it('circuit breaker: hiện trong P205, Owner mở khóa; tài khoản workspace khác → 404', async () => {
    const s = await setup();
    await recordFailure(s.ctx, s.acc.id, 1);
    expect((await executionControls(s.ctx)).breakers).toEqual([
      expect.objectContaining({ adAccountId: s.acc.id, accountName: 'TK Kill', open: true }),
    ]);
    const other = await setup();
    await expect(closeBreaker(other.ctx, s.acc.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await closeBreaker(s.ctx, s.acc.id);
    expect((await executionControls(s.ctx)).breakers).toEqual([]);
  });
});

describe('kill switch toàn cục (AD04) và CLI dự phòng', () => {
  it('bật toàn cục → hủy hành động đang chờ của mọi workspace, mở sự cố P1; tắt lại', async () => {
    const a = await setup();
    const b = await setup();
    const pa = await a.pending();
    const pb = await b.pending();
    expect(await setGlobalKillSwitch(db, { active: true, reason: 'Sự cố thực thi', changedBy: null })).toEqual({
      canceled: 2,
    });
    expect([await a.status(pa.id), await b.status(pb.id)]).toEqual(['canceled', 'canceled']);
    expect(await killSwitchState(a.ctx)).toEqual({ global: true, workspace: false });
    expect((await listIncidents(db, {})).some((i) => i.kind === 'kill_switch' && i.severity === 'P1')).toBe(true);
    await setGlobalKillSwitch(db, { active: false, reason: 'Đã xử lý xong', changedBy: null });
    expect((await getGlobalKillSwitch(db)).active).toBe(false);
  });

  it('CLI theo workspace: chỉ hủy hành động của workspace đó, ghi audit', async () => {
    const a = await setup();
    const b = await setup();
    const pa = await a.pending();
    const pb = await b.pending();
    expect(await setWorkspaceKillSwitchSystem(db, a.workspaceId, { active: true, reason: 'CLI: thử' })).toEqual({
      canceled: 1,
    });
    expect([await a.status(pa.id), await b.status(pb.id)]).toEqual(['canceled', 'pending']);
  });
});

describe('cờ duyệt hành động: checklist và tắt cờ', () => {
  it('checklist: quyền ghi, test tích hợp của phiên bản hiện tại, kill switch toàn cục, guardrails đã lưu', async () => {
    const s = await setup();
    const ids = (r: { id: string; passed: boolean }[]) => Object.fromEntries(r.map((x) => [x.id, x.passed]));
    expect(ids(await runChecklist(db, s.workspaceId, 'p2a_approve'))).toMatchObject({
      write_scope: false,
      staging_check: false,
      global_kill_switch_off: true,
      guardrails_configured: false,
    });
    await db
      .update(schema.metaConnections)
      .set({ scopes: ['ads_read', 'ads_management'], writeEnabled: true })
      .where(eq(schema.metaConnections.id, s.conn.id));
    await recordExecutionCheck(db, { appVersion: 'other-sha', appEnv: 'staging', passed: true, steps: [] });
    await recordExecutionCheck(db, { appVersion: 'test-sha', appEnv: 'staging', passed: true, steps: [] });
    await saveGuardrails(s.ctx, { ...GUARDRAIL_DEFAULTS, excludeMetaIds: [] });
    expect(ids(await runChecklist(db, s.workspaceId, 'p2a_approve'))).toMatchObject({
      write_scope: true,
      staging_check: true,
      guardrails_configured: true,
    });
    await setGlobalKillSwitch(db, { active: true, reason: 'kiểm tra checklist', changedBy: null });
    expect(ids(await runChecklist(db, s.workspaceId, 'p2a_approve')).global_kill_switch_off).toBe(false);
  });

  it('tắt cờ duyệt hành động → hủy mọi hành động đang chờ (L3 18.1); tắt cờ tự chạy → chỉ hủy tier auto', async () => {
    const s = await setup();
    const pm = await seedStaff(db, true);
    for (const key of ['p0_reports', 'p1_recommendations', 'p2a_approve', 'p2b_auto'] as const) {
      await enableFlag(db, {
        workspaceId: s.workspaceId,
        key,
        staffUserId: pm.id,
        reason: 'test hooks',
        override: true,
      });
    }
    const manual = await s.pending('approve');
    const auto = await s.pending('auto');
    await disableFlag(db, { workspaceId: s.workspaceId, key: 'p2b_auto', staffUserId: pm.id, reason: 'tắt tự chạy' });
    expect([await s.status(manual.id), await s.status(auto.id)]).toEqual(['pending', 'canceled']);
    await disableFlag(db, { workspaceId: s.workspaceId, key: 'p2a_approve', staffUserId: pm.id, reason: 'tắt duyệt' });
    expect(await s.status(manual.id)).toBe('canceled');
    const logs = await db
      .select()
      .from(schema.actionLogs)
      .where(and(eq(schema.actionLogs.actionId, manual.id), eq(schema.actionLogs.event, 'canceled')));
    expect(logs).toHaveLength(1);
  });
});
