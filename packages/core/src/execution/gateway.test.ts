import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@adxlens/db';
import { closeTestDb, seedMember, seedStaff, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { recordingEnqueue } from '@adxlens/jobs';
import { mockWriteState, MockMetaRead, MOCK_ACCOUNTS } from '@adxlens/meta-client/mock';
import { MockMetaWrite } from '@adxlens/meta-client/write-mock';
import { setSubscription } from '@adxlens/core/billing';
import {
  assignAdAccount,
  importAccounts,
  keysFromEnv,
  saveConnection,
  setWriteEnabled,
} from '@adxlens/core/connections';
import { disableFlag, enableFlag } from '@adxlens/core/flags';
import { startBackfill, syncRange } from '@adxlens/core/ingestion';
import { listNotifications } from '@adxlens/core/notification';
import { listIncidents } from '@adxlens/core/ops';
import { resolveActor } from '@adxlens/core/tenancy';
import {
  automationEffectiveness,
  liveEvaluate,
  approveRecommendation,
  executeAction,
  getAction,
  listActions,
  minorUnits,
  previewAction,
  proposalForRecommendation,
  requestAction,
  undoAction,
} from './index';

const db = testDb();
afterAll(() => closeTestDb());
const KEYS = keysFromEnv({ TOKEN_ENC_KEY_V1: Buffer.alloc(32, 11).toString('base64') });
// 10:00 giờ VN ngày 23/10/2026.
const now = () => new Date('2026-10-23T03:00:00Z');
const clock = { now };

let writer: MockMetaWrite;
beforeEach(async () => {
  await truncateAll(db);
  mockWriteState.reset();
  writer = new MockMetaWrite();
});

async function setup(opts: { flags?: boolean; plan?: 'free' | 'growth'; write?: boolean } = {}) {
  const { workspace, owner } = await seedWorkspace(db);
  const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
  const { connectionId } = await saveConnection(
    ctx,
    {
      token: 'mock-write-gw',
      expiresAt: null,
      scopes: ['ads_read', 'ads_management'],
      metaUser: { id: `m-${workspace.id}` },
      accounts: MOCK_ACCOUNTS,
    },
    KEYS,
  );
  const [imp] = await importAccounts(ctx, { connectionId, metaAccountIds: ['act_100000001'] });
  const adAccountId = imp!.adAccountId;
  const [client] = await db.insert(schema.clients).values({ workspaceId: workspace.id, name: 'Client GW' }).returning();
  await assignAdAccount(ctx, adAccountId, { clientId: client!.id });
  const enqueue = recordingEnqueue();
  await startBackfill(ctx, adAccountId, { enqueue, clock });
  await syncRange(ctx, enqueue.calls[0]!.payload as never, { meta: new MockMetaRead(now), keys: KEYS.keys, clock });
  if (opts.write !== false) await setWriteEnabled(ctx, connectionId, true);
  if (opts.flags !== false) {
    const pm = await seedStaff(db, true);
    for (const key of ['p0_reports', 'p1_recommendations', 'p2a_approve'] as const) {
      await enableFlag(db, {
        workspaceId: workspace.id,
        key,
        staffUserId: pm.id,
        reason: 'test gateway',
        override: true,
      });
    }
  }
  if ((opts.plan ?? 'growth') === 'growth') await setSubscription(ctx, { planKey: 'growth' });
  const ad = async (i = 0) => {
    const rows = await db
      .select({ metaId: schema.entities.metaId, parent: schema.entities.parentMetaId })
      .from(schema.entities)
      .where(and(eq(schema.entities.adAccountId, adAccountId), eq(schema.entities.entityType, 'ad')))
      .orderBy(schema.entities.metaId);
    return rows[i]!;
  };
  const adset = async (i = 0) => {
    const rows = await db
      .select({ metaId: schema.entities.metaId, budget: schema.entities.dailyBudget })
      .from(schema.entities)
      .where(and(eq(schema.entities.adAccountId, adAccountId), eq(schema.entities.entityType, 'adset')))
      .orderBy(schema.entities.metaId);
    return rows.filter((r) => r.budget)[i]!;
  };
  const run = async (actionId: string) =>
    executeAction({ db, workspaceId: workspace.id }, actionId, { writer, keys: KEYS.keys, clock, enqueue });
  return {
    ctx,
    workspaceId: workspace.id,
    owner,
    adAccountId,
    connectionId,
    clientId: client!.id,
    enqueue,
    ad,
    adset,
    run,
  };
}

async function logs(actionId: string) {
  return (await db.select().from(schema.actionLogs).where(eq(schema.actionLogs.actionId, actionId))).map(
    (l) => l.event,
  );
}

describe('Execution Gateway — luồng thành công (ADR-0008, ADR-0009)', () => {
  it('tạm dừng ad: duyệt → pending + enqueue; worker đọc trước, ghi một lần, đọc lại xác minh', async () => {
    const s = await setup();
    const { metaId } = await s.ad();
    const a = await requestAction(
      s.ctx,
      { adAccountId: s.adAccountId, actionType: 'pause_ad', targetMetaId: metaId },
      s,
    );
    expect(a).toMatchObject({
      status: 'pending',
      tier: 'approve',
      beforeState: { status: 'ACTIVE' },
      afterExpected: { status: 'PAUSED' },
    });
    expect(s.enqueue.calls.at(-1)).toMatchObject({ name: 'execute:action', payload: { actionId: a.id } });
    expect(await s.run(a.id)).toEqual({ status: 'success', resultCode: 'ok' });
    expect(writer.calls).toEqual([{ op: 'setStatus', id: metaId, value: 'PAUSED' }]);
    expect((await writer.getObject('', metaId, 'ad')).status).toBe('PAUSED');
    expect(await logs(a.id)).toEqual(['approved', 'before_live', 'meta_call', 'verify', 'success']);
    const [row] = await db.select().from(schema.actions).where(eq(schema.actions.id, a.id));
    expect(row!.verifiedAt).not.toBeNull();
    expect((await listNotifications(s.ctx, s.owner.id)).some((n) => n.kind === 'action_executed')).toBe(true);
  });

  it('đã ở trạng thái đích → không gọi Meta (no_change)', async () => {
    const s = await setup();
    const { metaId } = await s.ad();
    const a = await requestAction(
      s.ctx,
      { adAccountId: s.adAccountId, actionType: 'pause_ad', targetMetaId: metaId },
      s,
    );
    await writer.setStatus('', metaId, 'PAUSED');
    writer.calls.length = 0;
    expect(await s.run(a.id)).toEqual({ status: 'success', resultCode: 'no_change' });
    expect(writer.calls).toEqual([]);
  });

  it('ngân sách ngày ±10%: số nguyên đơn vị nhỏ nhất, xác minh bằng nhau tuyệt đối (ADR-0010)', async () => {
    const s = await setup();
    const { metaId, budget } = await s.adset();
    const cur = minorUnits(budget)!;
    const next = String((BigInt(cur) * 110n) / 100n);
    const a = await requestAction(
      s.ctx,
      { adAccountId: s.adAccountId, actionType: 'set_adset_budget', targetMetaId: metaId, newDailyBudget: next },
      s,
    );
    expect(a.beforeState).toEqual({ daily_budget: cur });
    expect(await s.run(a.id)).toEqual({ status: 'success', resultCode: 'ok' });
    expect((await writer.getObject('', metaId, 'adset')).daily_budget).toBe(next);
  });

  it('nhân bản ad set: bản sao PAUSED, lưu id bản sao; không hoàn tác được (ADR-0011)', async () => {
    const s = await setup();
    const { metaId } = await s.adset();
    const p = await previewAction(s.ctx, {
      adAccountId: s.adAccountId,
      actionType: 'duplicate_adset',
      targetMetaId: metaId,
    });
    expect(p.undoable).toBe(false);
    const a = await requestAction(
      s.ctx,
      { adAccountId: s.adAccountId, actionType: 'duplicate_adset', targetMetaId: metaId },
      s,
    );
    expect(await s.run(a.id)).toEqual({ status: 'success', resultCode: 'ok' });
    const [row] = await db.select().from(schema.actions).where(eq(schema.actions.id, a.id));
    const copy = row!.params.copied_adset_id!;
    expect((await writer.getObject('', copy, 'adset')).status).toBe('PAUSED');
  });
});

describe('Execution Gateway — lỗi giữa chừng, xác minh, idempotency (L3 14 kịch bản bắt buộc)', () => {
  it('Meta lỗi trước khi áp → failed, breaker đếm 1, báo lỗi cho Owner', async () => {
    const s = await setup();
    const { metaId } = await s.ad();
    const a = await requestAction(
      s.ctx,
      { adAccountId: s.adAccountId, actionType: 'pause_ad', targetMetaId: metaId },
      s,
    );
    writer.failNext('error_before');
    expect(await s.run(a.id)).toEqual({ status: 'failed', resultCode: 'meta_error' });
    const [b] = await db
      .select()
      .from(schema.circuitBreakers)
      .where(eq(schema.circuitBreakers.adAccountId, s.adAccountId));
    expect(b).toMatchObject({ consecutiveFailures: 1, open: false });
    expect((await listNotifications(s.ctx, s.owner.id)).some((n) => n.kind === 'action_failed')).toBe(true);
    const [row] = await db.select().from(schema.actions).where(eq(schema.actions.id, a.id));
    expect(row!.errorMessage).not.toMatch(/mock-write/);
  });

  it('Meta báo lỗi nhưng đã áp → đọc lại thấy đúng → success (không gọi lại)', async () => {
    const s = await setup();
    const { metaId } = await s.ad();
    const a = await requestAction(
      s.ctx,
      { adAccountId: s.adAccountId, actionType: 'pause_ad', targetMetaId: metaId },
      s,
    );
    writer.failNext('error_after');
    expect(await s.run(a.id)).toEqual({ status: 'success', resultCode: 'applied_despite_error' });
    expect(writer.calls.filter((c) => c.op === 'setStatus')).toHaveLength(1);
  });

  it('verify không khớp → failed verify_mismatch, lưu trạng thái thật', async () => {
    const s = await setup();
    const { metaId } = await s.ad();
    const a = await requestAction(
      s.ctx,
      { adAccountId: s.adAccountId, actionType: 'pause_ad', targetMetaId: metaId },
      s,
    );
    writer.failNext('wrong_value');
    expect(await s.run(a.id)).toEqual({ status: 'failed', resultCode: 'verify_mismatch' });
    const [row] = await db.select().from(schema.actions).where(eq(schema.actions.id, a.id));
    expect(row!.afterState).toMatchObject({ status: 'ARCHIVED' });
  });

  it('đối tượng bị đổi trên Meta sau khi duyệt → không ghi đè (state_changed)', async () => {
    const s = await setup();
    const { metaId, budget } = await s.adset();
    const cur = minorUnits(budget)!;
    const a = await requestAction(
      s.ctx,
      {
        adAccountId: s.adAccountId,
        actionType: 'set_adset_budget',
        targetMetaId: metaId,
        newDailyBudget: String((BigInt(cur) * 105n) / 100n),
      },
      s,
    );
    await writer.setDailyBudget('', metaId, String(BigInt(cur) * 2n));
    writer.calls.length = 0;
    expect(await s.run(a.id)).toEqual({ status: 'failed', resultCode: 'state_changed' });
    expect(writer.calls).toEqual([]);
  });

  it('nhân bản lỗi → không đoán, không gọi lại; báo kiểm tra thủ công', async () => {
    const s = await setup();
    const { metaId } = await s.adset();
    const a = await requestAction(
      s.ctx,
      { adAccountId: s.adAccountId, actionType: 'duplicate_adset', targetMetaId: metaId },
      s,
    );
    writer.failNext('error_before');
    expect(await s.run(a.id)).toEqual({ status: 'failed', resultCode: 'meta_error_check_manually' });
    expect(writer.calls.filter((c) => c.op === 'copyAdSet')).toHaveLength(1);
  });

  it('job chạy lại (retry trùng) → bỏ qua, không ghi lần hai; duyệt trùng khi đang chờ → 409', async () => {
    const s = await setup();
    const { metaId } = await s.ad();
    const input = { adAccountId: s.adAccountId, actionType: 'pause_ad' as const, targetMetaId: metaId };
    const a = await requestAction(s.ctx, input, s);
    await expect(requestAction(s.ctx, input, s)).rejects.toMatchObject({ code: 'CONFLICT' });
    await s.run(a.id);
    expect(await s.run(a.id)).toEqual({ status: 'skipped' });
    expect(writer.calls.filter((c) => c.op === 'setStatus')).toHaveLength(1);
  });

  it('3 lỗi liên tiếp → mở circuit breaker, chặn hành động mới của tài khoản', async () => {
    const s = await setup();
    for (let i = 0; i < 3; i++) {
      const { metaId } = await s.ad(i);
      const a = await requestAction(
        s.ctx,
        { adAccountId: s.adAccountId, actionType: 'pause_ad', targetMetaId: metaId },
        s,
      );
      writer.failNext('error_before');
      await s.run(a.id);
    }
    const { metaId } = await s.ad(3);
    await expect(
      requestAction(s.ctx, { adAccountId: s.adAccountId, actionType: 'pause_ad', targetMetaId: metaId }, s),
    ).rejects.toMatchObject({ code: 'KILL_SWITCH_ACTIVE', details: { reason: 'circuit_breaker_open' } });
    // Playbook execution_failed: gom sự cố theo tài khoản (một sự cố, 3 lần), nâng P1 khi breaker mở.
    const inc = (await listIncidents(db, {})).filter((i) => i.kind === 'execution_failed');
    expect(inc).toHaveLength(1);
    expect(inc[0]).toMatchObject({ severity: 'P1', occurrences: 3, adAccountId: s.adAccountId });
  });
});

describe('Execution Gateway — cổng an toàn và quyền', () => {
  it('cờ tắt → không chạy (request 404; action đang chờ bị hủy khi worker chạy)', async () => {
    const s = await setup();
    const { metaId } = await s.ad();
    const a = await requestAction(
      s.ctx,
      { adAccountId: s.adAccountId, actionType: 'pause_ad', targetMetaId: metaId },
      s,
    );
    const pm = await seedStaff(db, true);
    await disableFlag(db, {
      workspaceId: s.workspaceId,
      key: 'p2a_approve',
      staffUserId: pm.id,
      reason: 'tắt để test',
    });
    expect(await s.run(a.id)).toEqual({ status: 'canceled', resultCode: 'feature_disabled' });
    expect(writer.calls).toEqual([]);
    await expect(
      requestAction(s.ctx, { adAccountId: s.adAccountId, actionType: 'pause_ad', targetMetaId: metaId }, s),
    ).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
  });

  it('kill switch workspace hoặc toàn cục → chặn; gói Free → 402; chưa có quyền ghi → 403', async () => {
    const s = await setup();
    const { metaId } = await s.ad();
    const input = { adAccountId: s.adAccountId, actionType: 'pause_ad' as const, targetMetaId: metaId };
    await db.insert(schema.killSwitches).values({ scopeKey: s.workspaceId, workspaceId: s.workspaceId, active: true });
    await expect(requestAction(s.ctx, input, s)).rejects.toMatchObject({ code: 'KILL_SWITCH_ACTIVE' });
    await db.delete(schema.killSwitches);
    await db.insert(schema.killSwitches).values({ scopeKey: 'global', active: true });
    await expect(requestAction(s.ctx, input, s)).rejects.toMatchObject({ code: 'KILL_SWITCH_ACTIVE' });
    await db.delete(schema.killSwitches);

    const free = await setup({ plan: 'free' });
    const f = await free.ad();
    await expect(
      requestAction(free.ctx, { adAccountId: free.adAccountId, actionType: 'pause_ad', targetMetaId: f.metaId }, free),
    ).rejects.toMatchObject({ code: 'PLAN_REQUIRED' });
    const ro = await setup({ write: false });
    const r = await ro.ad();
    await expect(
      requestAction(ro.ctx, { adAccountId: ro.adAccountId, actionType: 'pause_ad', targetMetaId: r.metaId }, ro),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', details: { reason: 'no_write_access' } });
  });

  it('kill switch bật sau khi duyệt → worker hủy, không gọi Meta', async () => {
    const s = await setup();
    const { metaId } = await s.ad();
    const a = await requestAction(
      s.ctx,
      { adAccountId: s.adAccountId, actionType: 'pause_ad', targetMetaId: metaId },
      s,
    );
    await db.insert(schema.killSwitches).values({ scopeKey: 'global', active: true });
    expect(await s.run(a.id)).toEqual({ status: 'canceled', resultCode: 'kill_switch' });
    expect(writer.calls).toEqual([]);
  });

  it('guardrails: ngân sách +20% bị chặn; quá 5 hành động/ngày bị chặn', async () => {
    const s = await setup();
    const { metaId, budget } = await s.adset();
    const cur = minorUnits(budget)!;
    await expect(
      requestAction(
        s.ctx,
        {
          adAccountId: s.adAccountId,
          actionType: 'set_adset_budget',
          targetMetaId: metaId,
          newDailyBudget: String((BigInt(cur) * 120n) / 100n),
        },
        s,
      ),
    ).rejects.toMatchObject({ code: 'GUARDRAIL_VIOLATION' });
    for (let i = 0; i < 5; i++) {
      const ad = await s.ad(i);
      await requestAction(s.ctx, { adAccountId: s.adAccountId, actionType: 'pause_ad', targetMetaId: ad.metaId }, s);
    }
    const sixth = await s.ad(5);
    const err = await requestAction(
      s.ctx,
      { adAccountId: s.adAccountId, actionType: 'pause_ad', targetMetaId: sixth.metaId },
      s,
    ).catch((e: { code: string; details: { violations: { code: string }[] } }) => e);
    expect(err).toMatchObject({ code: 'GUARDRAIL_VIOLATION' });
    expect((err as { details: { violations: { code: string }[] } }).details.violations.map((v) => v.code)).toEqual([
      'too_many_actions',
    ]);
  });

  it('buyer cần quyền duyệt theo Client do Owner cấp', async () => {
    const s = await setup();
    const { metaId } = await s.ad();
    const buyer = await seedMember(db, s.workspaceId, 'buyer', [s.clientId]);
    const bctx = { db, workspaceId: s.workspaceId, actor: (await resolveActor(db, s.workspaceId, buyer.id))! };
    const input = { adAccountId: s.adAccountId, actionType: 'pause_ad' as const, targetMetaId: metaId };
    await expect(requestAction(bctx, input, s)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await db
      .update(schema.memberships)
      .set({ approveClientIds: [s.clientId] })
      .where(and(eq(schema.memberships.workspaceId, s.workspaceId), eq(schema.memberships.userId, buyer.id)));
    const bctx2 = { db, workspaceId: s.workspaceId, actor: (await resolveActor(db, s.workspaceId, buyer.id))! };
    expect((await requestAction(bctx2, input, s)).status).toBe('pending');
  });

  it('cách ly: không tạo / chạy được hành động trên tài khoản workspace khác', async () => {
    const a = await setup();
    const b = await setup();
    const { metaId } = await b.ad();
    await expect(
      requestAction(a.ctx, { adAccountId: b.adAccountId, actionType: 'pause_ad', targetMetaId: metaId }, a),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const act = await requestAction(
      b.ctx,
      { adAccountId: b.adAccountId, actionType: 'pause_ad', targetMetaId: metaId },
      b,
    );
    expect(await a.run(act.id)).toEqual({ status: 'skipped' });
    const [{ n }] = (await db.execute<{ n: string }>(
      sql`select count(*)::text as n from app.action_logs where workspace_id = ${a.workspaceId}`,
    )) as unknown as [{ n: string }];
    expect(n).toBe('0');
  });

  it('nhật ký hành động không sửa được (append-only)', async () => {
    const s = await setup();
    const { metaId } = await s.ad();
    const a = await requestAction(
      s.ctx,
      { adAccountId: s.adAccountId, actionType: 'pause_ad', targetMetaId: metaId },
      s,
    );
    await expect(
      db.update(schema.actionLogs).set({ event: 'hacked' }).where(eq(schema.actionLogs.actionId, a.id)),
    ).rejects.toThrow();
  });
});

describe('nhật ký và hoàn tác (P203, P204, P2-06)', () => {
  it('tạm dừng → hoàn tác bật lại qua đúng gateway; gốc chuyển "đã hoàn tác"; bản chụp cấu trúc cập nhật', async () => {
    const s = await setup();
    const { metaId } = await s.ad();
    const a = await requestAction(
      s.ctx,
      { adAccountId: s.adAccountId, actionType: 'pause_ad', targetMetaId: metaId },
      s,
    );
    await s.run(a.id);
    const [e] = await db
      .select({ status: schema.entities.status })
      .from(schema.entities)
      .where(and(eq(schema.entities.adAccountId, s.adAccountId), eq(schema.entities.metaId, metaId)));
    expect(e!.status).toBe('PAUSED');
    const detail = await getAction(s.ctx, a.id);
    expect(detail.undoable).toBe(true);
    expect(detail.logs.map((l) => l.event)).toContain('verify');
    const u = await undoAction(s.ctx, a.id, s);
    expect(u).toMatchObject({ actionType: 'resume_ad', undoOf: a.id, beforeState: { status: 'PAUSED' } });
    expect(await s.run(u.id)).toEqual({ status: 'success', resultCode: 'ok' });
    expect((await writer.getObject('', metaId, 'ad')).status).toBe('ACTIVE');
    const after = await getAction(s.ctx, a.id);
    expect(after.status).toBe('undone');
    expect(after.undoable).toBe(false);
    await expect(undoAction(s.ctx, a.id, s)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('hoàn tác ngân sách về đúng giá trị cũ; nhân bản và hành động thất bại không hoàn tác được', async () => {
    const s = await setup();
    const { metaId, budget } = await s.adset();
    const cur = minorUnits(budget)!;
    const a = await requestAction(
      s.ctx,
      {
        adAccountId: s.adAccountId,
        actionType: 'set_adset_budget',
        targetMetaId: metaId,
        newDailyBudget: String((BigInt(cur) * 110n) / 100n),
      },
      s,
    );
    await s.run(a.id);
    const u = await undoAction(s.ctx, a.id, s);
    await s.run(u.id);
    expect((await writer.getObject('', metaId, 'adset')).daily_budget).toBe(cur);

    const d = await requestAction(
      s.ctx,
      { adAccountId: s.adAccountId, actionType: 'duplicate_adset', targetMetaId: metaId },
      s,
    );
    await s.run(d.id);
    await expect(undoAction(s.ctx, d.id, s)).rejects.toMatchObject({ code: 'CONFLICT' });
    const { metaId: adId } = await s.ad();
    const f = await requestAction(s.ctx, { adAccountId: s.adAccountId, actionType: 'pause_ad', targetMetaId: adId }, s);
    writer.failNext('error_before');
    await s.run(f.id);
    await expect(undoAction(s.ctx, f.id, s)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('danh sách theo phạm vi Client; buyer không thấy tài khoản ngoài phạm vi; workspace khác 404', async () => {
    const s = await setup();
    const { metaId } = await s.ad();
    const a = await requestAction(
      s.ctx,
      { adAccountId: s.adAccountId, actionType: 'pause_ad', targetMetaId: metaId },
      s,
    );
    expect((await listActions(s.ctx)).map((x) => x.id)).toEqual([a.id]);
    expect(await listActions(s.ctx, { status: 'success' })).toEqual([]);
    const buyer = await seedMember(db, s.workspaceId, 'buyer', []);
    const bctx = { db, workspaceId: s.workspaceId, actor: (await resolveActor(db, s.workspaceId, buyer.id))! };
    expect(await listActions(bctx)).toEqual([]);
    await expect(getAction(bctx, a.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const other = await setup();
    await expect(getAction(other.ctx, a.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('playbook execution_failed', () => {
  it('breaker mở → hủy hành động đang chờ khác của tài khoản; lần đầu mở sự cố P1', async () => {
    const s = await setup();
    const { saveGuardrails, GUARDRAIL_DEFAULTS } = await import('./index');
    await saveGuardrails(s.ctx, { ...GUARDRAIL_DEFAULTS, excludeMetaIds: [], breakerFailures: 1 });
    const first = await s.ad(0);
    const second = await s.ad(1);
    const a = await requestAction(
      s.ctx,
      { adAccountId: s.adAccountId, actionType: 'pause_ad', targetMetaId: first.metaId },
      s,
    );
    const b = await requestAction(
      s.ctx,
      { adAccountId: s.adAccountId, actionType: 'pause_ad', targetMetaId: second.metaId },
      s,
    );
    writer.failNext('error_before');
    await s.run(a.id);
    const [rb] = await db.select().from(schema.actions).where(eq(schema.actions.id, b.id));
    expect(rb).toMatchObject({ status: 'canceled', resultCode: 'circuit_breaker_open' });
    const inc = (await listIncidents(db, {})).find((i) => i.kind === 'execution_failed');
    expect(inc?.severity).toBe('P1');
  });
});

describe('duyệt từ gợi ý (P202, P2-03)', () => {
  async function rec(s: Awaited<ReturnType<typeof setup>>, sourceKey: string, entityType: string, metaId: string) {
    const [r] = await db
      .insert(schema.recommendations)
      .values({
        workspaceId: s.workspaceId,
        adAccountId: s.adAccountId,
        week: '2026-10-19',
        source: 'finding',
        sourceKey,
        entityType,
        metaId,
        entityName: metaId,
        action: { key: 'x' },
        why: { key: 'y' },
        evidence: {},
        confidence: '0.7',
        effortMinutes: 10,
        score: '1',
      })
      .returning();
    return r!;
  }

  it('creative mệt → đề xuất tạm dừng ad; duyệt → "Đang làm"; thực hiện xong → gợi ý "Đã làm"', async () => {
    const s = await setup();
    const { metaId } = await s.ad();
    const r = await rec(s, 'creative_fatigue', 'ad', metaId);
    const p = await proposalForRecommendation(s.ctx, r.id);
    expect(p).toMatchObject({
      executable: true,
      actionType: 'pause_ad',
      before: { status: 'ACTIVE' },
      after: { status: 'PAUSED' },
      violations: [],
      canApprove: true,
      undoable: true,
    });
    const a = await approveRecommendation(s.ctx, r.id, s);
    const [mid] = await db.select().from(schema.recommendations).where(eq(schema.recommendations.id, r.id));
    expect(mid!.status).toBe('in_progress');
    await s.run(a.id);
    const [done] = await db.select().from(schema.recommendations).where(eq(schema.recommendations.id, r.id));
    expect(done).toMatchObject({ status: 'done' });
    expect(done!.doneAt).not.toBeNull();
  });

  it('phân bổ ngân sách kém → giảm đúng 15%, cảnh báo về giai đoạn học; không bao giờ tăng', async () => {
    const s = await setup();
    const { metaId, budget } = await s.adset();
    const r = await rec(s, 'budget_misallocation', 'adset', metaId);
    const p = await proposalForRecommendation(s.ctx, r.id);
    const cur = BigInt(minorUnits(budget)!);
    expect(p).toMatchObject({ actionType: 'set_adset_budget', after: { daily_budget: String((cur * 85n) / 100n) } });
    expect(p.executable && p.warnings).toContain('learning_reset');
    expect(p.executable && p.violations).toEqual([]);
  });

  it('gợi ý không thực hiện tự động được → không có đề xuất, duyệt → 409; buyer chưa được cấp quyền thấy canApprove=false', async () => {
    const s = await setup();
    const r = await rec(s, 'account_hygiene', 'adset', 'x');
    expect(await proposalForRecommendation(s.ctx, r.id)).toEqual({ executable: false });
    await expect(approveRecommendation(s.ctx, r.id, s)).rejects.toMatchObject({ code: 'CONFLICT' });
    const { metaId } = await s.ad();
    const r2 = await rec(s, 'creative_fatigue', 'ad', metaId);
    const buyer = await seedMember(db, s.workspaceId, 'buyer', [s.clientId]);
    const bctx = { db, workspaceId: s.workspaceId, actor: (await resolveActor(db, s.workspaceId, buyer.id))! };
    expect(await proposalForRecommendation(bctx, r2.id)).toMatchObject({ executable: true, canApprove: false });
    await expect(approveRecommendation(bctx, r2.id, s)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('gợi ý của workspace khác → 404', async () => {
    const a = await setup();
    const b = await setup();
    const { metaId } = await b.ad();
    const r = await rec(b, 'creative_fatigue', 'ad', metaId);
    await expect(proposalForRecommendation(a.ctx, r.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(approveRecommendation(a.ctx, r.id, a)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('rule live tạo hành động tự động (P2b, ADR-0012)', () => {
  async function liveRule(s: Awaited<ReturnType<typeof setup>>, extra: { maxActionsPerDay?: number } = {}) {
    const pm = await seedStaff(db, true);
    await enableFlag(db, {
      workspaceId: s.workspaceId,
      key: 'p2b_auto',
      staffUserId: pm.id,
      reason: 'test live rule',
      override: true,
    });
    const [r] = await db
      .insert(schema.automationRules)
      .values({
        workspaceId: s.workspaceId,
        adAccountId: s.adAccountId,
        name: 'Tạm dừng mọi ad có chi tiêu',
        level: 'ad',
        condition: [{ metric: 'spend', op: 'gte', value: '0' }],
        action: { type: 'pause_ad' },
        guardrails: extra,
        mode: 'live',
        createdBy: s.owner.id,
      })
      .returning();
    return r!;
  }

  it('khớp → tạo hành động tier auto, tối đa theo giới hạn/ngày; worker thực hiện; lần sau trong 24 giờ không lặp', async () => {
    const s = await setup();
    const rule = await liveRule(s, { maxActionsPerDay: 2 });
    const ctx = { db, workspaceId: s.workspaceId };
    const r = await liveEvaluate(ctx, rule.id, { enqueue: s.enqueue, clock });
    expect(r).toEqual({ status: 'evaluated', created: 2 });
    const auto = await db.select().from(schema.actions).where(eq(schema.actions.ruleId, rule.id));
    expect(auto.every((a) => a.tier === 'auto' && a.requestedBy === null)).toBe(true);
    expect(await s.run(auto[0]!.id)).toEqual({ status: 'success', resultCode: 'ok' });
    const [ev] = await db.select().from(schema.ruleEvaluations).where(eq(schema.ruleEvaluations.ruleId, rule.id));
    expect(ev!.actionIds).toHaveLength(2);
    expect(ev!.blockedByGuardrail).toContain('too_many_actions');
    const again = await liveEvaluate(ctx, rule.id, { enqueue: s.enqueue, clock });
    expect(again).toEqual({ status: 'evaluated', created: 0 });
  });

  it('giờ yên lặng (23:30 giờ tài khoản), kill switch, tắt cờ tự chạy → không tạo hành động', async () => {
    const s = await setup();
    const rule = await liveRule(s);
    const ctx = { db, workspaceId: s.workspaceId };
    const night = { now: () => new Date('2026-10-23T16:30:00Z') };
    expect(await liveEvaluate(ctx, rule.id, { enqueue: s.enqueue, clock: night })).toEqual({
      status: 'evaluated',
      created: 0,
    });
    await db.insert(schema.killSwitches).values({ scopeKey: s.workspaceId, workspaceId: s.workspaceId, active: true });
    expect(await liveEvaluate(ctx, rule.id, { enqueue: s.enqueue, clock })).toEqual({
      status: 'evaluated',
      created: 0,
    });
    await db.delete(schema.killSwitches);
    const pm = await seedStaff(db, true);
    await disableFlag(db, { workspaceId: s.workspaceId, key: 'p2b_auto', staffUserId: pm.id, reason: 'tắt tự chạy' });
    expect(await liveEvaluate(ctx, rule.id, { enqueue: s.enqueue, clock })).toEqual({
      status: 'evaluated',
      created: 0,
    });
    const evs = await db.select().from(schema.ruleEvaluations).where(eq(schema.ruleEvaluations.ruleId, rule.id));
    expect(evs.map((e) => e.blockedByGuardrail)).toEqual(
      expect.arrayContaining(['quiet_hours', 'kill_switch', 'feature_disabled']),
    );
  });

  it('rule không ở chế độ live → bỏ qua', async () => {
    const s = await setup();
    const rule = await liveRule(s);
    await db.update(schema.automationRules).set({ mode: 'paused' }).where(eq(schema.automationRules.id, rule.id));
    expect(await liveEvaluate({ db, workspaceId: s.workspaceId }, rule.id, { enqueue: s.enqueue, clock })).toEqual({
      status: 'skipped',
    });
  });

  it('hiệu quả tự động hóa (P215): số hành động, thành công, hoàn tác, chi tiêu 7 ngày trước của đối tượng bị tạm dừng', async () => {
    const s = await setup();
    const rule = await liveRule(s, { maxActionsPerDay: 1 });
    await liveEvaluate({ db, workspaceId: s.workspaceId }, rule.id, { enqueue: s.enqueue, clock });
    const [a] = await db.select().from(schema.actions).where(eq(schema.actions.ruleId, rule.id));
    await s.run(a!.id);
    const u = await undoAction(s.ctx, a!.id, s);
    await s.run(u.id);
    const [eff] = await automationEffectiveness(s.ctx, { clock });
    expect(eff).toMatchObject({ ruleId: rule.id, total: 1, success: 1, failed: 0, undone: 1, undoRate: 1 });
    expect(Number(eff!.pausedSpend7d)).toBeGreaterThanOrEqual(0);
  });
});
