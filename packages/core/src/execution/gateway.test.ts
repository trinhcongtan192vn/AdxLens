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
import { resolveActor } from '@adxlens/core/tenancy';
import { executeAction, minorUnits, previewAction, requestAction } from './index';

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
