import { and, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@adxlens/db';
import { closeTestDb, seedStaff, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
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
import { enableFlag } from '@adxlens/core/flags';
import { startBackfill, syncRange } from '@adxlens/core/ingestion';
import { listNotifications } from '@adxlens/core/notification';
import { dueReverts } from '@adxlens/core/ops';
import { resolveActor } from '@adxlens/core/tenancy';
import {
  createRule,
  inRuleSchedule,
  executeAction,
  liveEvaluate,
  nextLocalHour,
  RULE_TEMPLATES,
  runScheduledRevert,
  type RuleInput,
} from './index';

const db = testDb();
afterAll(() => closeTestDb());
const KEYS = keysFromEnv({ TOKEN_ENC_KEY_V1: Buffer.alloc(32, 12).toString('base64') });
// 10:00 giờ VN ngày 23/10/2026.
const NOW = new Date('2026-10-23T03:00:00Z');
const clock = { now: () => NOW };
const at = (iso: string) => ({ now: () => new Date(iso) });

let writer: MockMetaWrite;
beforeEach(async () => {
  await truncateAll(db);
  mockWriteState.reset();
  writer = new MockMetaWrite();
});

async function setup() {
  const { workspace, owner } = await seedWorkspace(db);
  const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
  const { connectionId } = await saveConnection(
    ctx,
    {
      token: 'mock-write-tac',
      expiresAt: null,
      scopes: ['ads_read', 'ads_management'],
      metaUser: { id: `t-${workspace.id}` },
      accounts: MOCK_ACCOUNTS,
    },
    KEYS,
  );
  const [imp] = await importAccounts(ctx, { connectionId, metaAccountIds: ['act_100000001'] });
  const adAccountId = imp!.adAccountId;
  const [client] = await db.insert(schema.clients).values({ workspaceId: workspace.id, name: 'Client T' }).returning();
  await assignAdAccount(ctx, adAccountId, { clientId: client!.id });
  const enqueue = recordingEnqueue();
  await startBackfill(ctx, adAccountId, { enqueue, clock });
  await syncRange(ctx, enqueue.calls[0]!.payload as never, {
    meta: new MockMetaRead(clock.now),
    keys: KEYS.keys,
    clock,
  });
  await setWriteEnabled(ctx, connectionId, true);
  const pm = await seedStaff(db, true);
  for (const key of ['p0_reports', 'p1_recommendations', 'p2a_approve', 'p2b_auto'] as const) {
    await enableFlag(db, { workspaceId: workspace.id, key, staffUserId: pm.id, reason: 'test tactic', override: true });
  }
  await setSubscription(ctx, { planKey: 'growth' });
  const wctx = { db, workspaceId: workspace.id };
  const run = (actionId: string, c = clock) =>
    executeAction(wctx, actionId, { writer, keys: KEYS.keys, clock: c, enqueue });
  const rule = async (values: Partial<typeof schema.automationRules.$inferInsert>) => {
    const [r] = await db
      .insert(schema.automationRules)
      .values({
        workspaceId: workspace.id,
        adAccountId,
        name: 'Tactic',
        level: 'adset',
        condition: [{ metric: 'spend', op: 'gte', value: '0' }],
        action: { type: 'pause_adset' },
        guardrails: { maxActionsPerDay: 1 },
        mode: 'live',
        createdBy: owner.id,
        ...values,
      })
      .returning();
    return r!;
  };
  return { ctx, wctx, workspaceId: workspace.id, adAccountId, enqueue, run, rule };
}

const actionsOf = (ruleId: string) => db.select().from(schema.actions).where(eq(schema.actions.ruleId, ruleId));
const revertsOf = (ruleId: string) =>
  db.select().from(schema.scheduledReverts).where(eq(schema.scheduledReverts.ruleId, ruleId));

describe('hành động hẹn giờ của rule (ADR-0021)', () => {
  it('giờ hẹn theo giờ tài khoản: 21:00 hôm nay nếu chưa qua, 07:00 sáng mai', () => {
    expect(nextLocalHour(NOW, 'Asia/Ho_Chi_Minh', 21).toISOString()).toBe('2026-10-23T14:00:00.000Z');
    expect(nextLocalHour(NOW, 'Asia/Ho_Chi_Minh', 7).toISOString()).toBe('2026-10-24T00:00:00.000Z');
    expect(nextLocalHour(NOW, 'Asia/Ho_Chi_Minh', 10).toISOString()).toBe('2026-10-24T03:00:00.000Z');
    expect(nextLocalHour(NOW, 'America/New_York', 9).toISOString()).toBe('2026-10-23T13:00:00.000Z');
  });

  it('Surf: tăng ngân sách → hẹn trả lúc 21:00 → trả đúng ngân sách cũ qua Gateway (bỏ cooldown chỉ cho lần trả)', async () => {
    const s = await setup();
    const r = await s.rule({
      action: {
        type: 'set_adset_budget',
        changePct: '10',
        maxDailyBudget: '999999999',
        revert: { kind: 'restore_budget', hour: 21 },
      },
      templateKey: 'surf_winner',
    });
    expect(await liveEvaluate(s.wctx, r.id, { enqueue: s.enqueue, clock })).toEqual({
      status: 'evaluated',
      created: 1,
    });
    const [a] = await actionsOf(r.id);
    const [rv] = await revertsOf(r.id);
    expect(rv).toMatchObject({ kind: 'restore_budget', status: 'pending', actionId: a!.id });
    expect(rv!.dueAt.toISOString()).toBe('2026-10-23T14:00:00.000Z');
    // Chưa tới giờ → chờ; hành động gốc chưa chạy → bỏ qua khi tới giờ.
    expect(await runScheduledRevert(s.wctx, rv!.id, { enqueue: s.enqueue, clock })).toMatchObject({
      status: 'waiting',
    });
    expect(await s.run(a!.id)).toEqual({ status: 'success', resultCode: 'ok' });
    expect((await dueReverts(db, new Date('2026-10-23T13:59:00Z'))).length).toBe(0);
    expect((await dueReverts(db, new Date('2026-10-23T14:00:00Z'))).map((x) => x.id)).toEqual([rv!.id]);

    const evening = at('2026-10-23T14:05:00Z');
    const out = await runScheduledRevert(s.wctx, rv!.id, { enqueue: s.enqueue, clock: evening });
    expect(out).toMatchObject({ status: 'done', result: 'restored' });
    const back = (await actionsOf(r.id)).find((x) => x.id === out.resultActionId)!;
    expect(back).toMatchObject({
      tier: 'auto',
      actionType: 'set_adset_budget',
      targetMetaId: a!.targetMetaId,
      beforeState: { daily_budget: a!.afterExpected.daily_budget },
      afterExpected: { daily_budget: a!.beforeState.daily_budget },
    });
    expect(await s.run(back.id, evening)).toEqual({ status: 'success', resultCode: 'ok' });
    // Một lần: chạy lại không tạo thêm.
    expect(await runScheduledRevert(s.wctx, rv!.id, { enqueue: s.enqueue, clock: evening })).toMatchObject({
      status: 'skipped',
      result: 'not_pending',
    });
  });

  it('Surf: người dùng đã sửa ngân sách tay → không trả; giờ yên tĩnh → chờ lần sau', async () => {
    const s = await setup();
    const r = await s.rule({
      action: {
        type: 'set_adset_budget',
        changePct: '10',
        maxDailyBudget: '999999999',
        revert: { kind: 'restore_budget', hour: 21 },
      },
    });
    await liveEvaluate(s.wctx, r.id, { enqueue: s.enqueue, clock });
    const [a] = await actionsOf(r.id);
    await s.run(a!.id);
    const [rv] = await revertsOf(r.id);
    // 23:30 giờ VN: giờ yên tĩnh → chờ, không đổi trạng thái lịch.
    expect(
      await runScheduledRevert(s.wctx, rv!.id, { enqueue: s.enqueue, clock: at('2026-10-23T16:30:00Z') }),
    ).toMatchObject({
      status: 'waiting',
      result: 'quiet_hours',
    });
    await db
      .update(schema.entities)
      .set({ dailyBudget: '123456' })
      .where(and(eq(schema.entities.adAccountId, s.adAccountId), eq(schema.entities.metaId, a!.targetMetaId)));
    expect(
      await runScheduledRevert(s.wctx, rv!.id, { enqueue: s.enqueue, clock: at('2026-10-24T00:30:00Z') }),
    ).toMatchObject({
      status: 'skipped',
      result: 'manual_change',
    });
    expect(await actionsOf(r.id)).toHaveLength(1);
  });

  it('Stop-loss: tạm dừng → sáng mai đề xuất bật lại (thông báo + Hoàn tác), KHÔNG tự bật lại', async () => {
    const s = await setup();
    const r = await s.rule({
      level: 'ad',
      action: { type: 'pause_ad', revert: { kind: 'suggest_undo', hour: 7 } },
      templateKey: 'stop_loss_no_clicks',
    });
    await liveEvaluate(s.wctx, r.id, { enqueue: s.enqueue, clock });
    const [a] = await actionsOf(r.id);
    await s.run(a!.id);
    const [rv] = await revertsOf(r.id);
    expect(rv).toMatchObject({ kind: 'suggest_undo' });
    expect(rv!.dueAt.toISOString()).toBe('2026-10-24T00:00:00.000Z');
    const out = await runScheduledRevert(s.wctx, rv!.id, { enqueue: s.enqueue, clock: at('2026-10-24T00:05:00Z') });
    expect(out).toMatchObject({ status: 'done', result: 'notified' });
    expect(await actionsOf(r.id)).toHaveLength(1);
    const n = await listNotifications(s.ctx, s.ctx.actor.userId);
    expect(n.find((x) => x.kind === 'rule_suggest_resume')).toMatchObject({ link: `/action-log/${a!.id}` });
  });

  it('Revive: chỉ đối tượng do RULE dừng, một đề xuất / hành động; không tạo hành động ghi', async () => {
    const s = await setup();
    const stop = await s.rule({ level: 'ad', action: { type: 'pause_ad' }, guardrails: { maxActionsPerDay: 1 } });
    await liveEvaluate(s.wctx, stop.id, { enqueue: s.enqueue, clock });
    const [paused] = await actionsOf(stop.id);
    await s.run(paused!.id);
    // Một quảng cáo người dùng tự tắt (không qua rule).
    const [manual] = await db
      .select({ metaId: schema.entities.metaId })
      .from(schema.entities)
      .where(and(eq(schema.entities.adAccountId, s.adAccountId), eq(schema.entities.entityType, 'ad')))
      .limit(2)
      .then((rows) => rows.filter((x) => x.metaId !== paused!.targetMetaId));
    await db
      .update(schema.entities)
      .set({ status: 'PAUSED' })
      .where(and(eq(schema.entities.adAccountId, s.adAccountId), eq(schema.entities.metaId, manual!.metaId)));

    const revive = await s.rule({
      level: 'ad',
      condition: [{ metric: 'spend', op: 'gte', value: '0' }],
      action: { type: 'suggest_resume' },
      guardrails: {},
    });
    expect(await liveEvaluate(s.wctx, revive.id, { enqueue: s.enqueue, clock })).toEqual({
      status: 'evaluated',
      created: 0,
    });
    const rs = await revertsOf(revive.id);
    expect(rs.map((x) => [x.kind, x.actionId])).toEqual([['suggest_undo', paused!.id]]);
    expect(await actionsOf(revive.id)).toEqual([]);
    // Lần sau: không đề xuất lại.
    await liveEvaluate(s.wctx, revive.id, { enqueue: s.enqueue, clock });
    expect(await revertsOf(revive.id)).toHaveLength(1);
    const [ev] = await db
      .select()
      .from(schema.ruleEvaluations)
      .where(eq(schema.ruleEvaluations.ruleId, revive.id))
      .orderBy(schema.ruleEvaluations.id)
      .offset(1);
    expect(ev!.wouldDo).toEqual([
      { metaId: paused!.targetMetaId, actionType: 'suggest_resume', blockedBy: 'already_suggested' },
    ]);
  });

  it('Sunsetting: −15% nhưng không dưới sàn; đã ở sàn → bỏ qua; cooldown 48 giờ', async () => {
    const s = await setup();
    const [as] = await db
      .select({ metaId: schema.entities.metaId, budget: schema.entities.dailyBudget })
      .from(schema.entities)
      .where(and(eq(schema.entities.adAccountId, s.adAccountId), eq(schema.entities.entityType, 'adset')))
      .orderBy(schema.entities.metaId)
      .limit(1);
    const budget = BigInt(Math.round(Number(as!.budget)));
    const floor = ((budget * 90n) / 100n).toString();
    const r = await s.rule({
      condition: [{ metric: 'spend', op: 'gte', value: '0' }],
      action: { type: 'set_adset_budget', changePct: '-15', floorDailyBudget: floor },
      guardrails: { maxActionsPerDay: 1, excludeMetaIds: [] },
      templateKey: 'sunset_loser',
    });
    await liveEvaluate(s.wctx, r.id, { enqueue: s.enqueue, clock });
    const [a] = await actionsOf(r.id);
    expect(a!.afterExpected.daily_budget).toBe(floor);
    await s.run(a!.id);
    // 30 giờ sau: vẫn trong cooldown 48 giờ của Sunsetting.
    await liveEvaluate(s.wctx, r.id, { enqueue: s.enqueue, clock: at('2026-10-24T09:00:00Z') });
    expect((await actionsOf(r.id)).filter((x) => x.targetMetaId === a!.targetMetaId)).toHaveLength(1);
  });
});

describe('kiểm tra hợp lệ của tactic (ADR-0021)', () => {
  const base = (adAccountId: string, over: Partial<RuleInput>): RuleInput => ({
    adAccountId,
    name: 'T',
    level: 'adset',
    condition: [{ metric: 'spend', op: 'gte', value: '0' }],
    action: { type: 'pause_adset' },
    ...over,
  });

  it('hẹn giờ sai loại / trong giờ yên tĩnh; sàn khi tăng; Sunsetting thiếu sàn; Revive có tham số; cooldown < 24', async () => {
    const s = await setup();
    const id = s.adAccountId;
    await expect(
      createRule(
        s.ctx,
        base(id, { action: { type: 'pause_adset', revert: { kind: 'restore_budget', hour: 21 } } }),
        clock,
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(
      createRule(
        s.ctx,
        base(id, {
          action: {
            type: 'set_adset_budget',
            changePct: '10',
            maxDailyBudget: '9',
            revert: { kind: 'restore_budget', hour: 23 },
          },
        }),
        clock,
      ),
    ).rejects.toMatchObject({ code: 'GUARDRAIL_VIOLATION' });
    await expect(
      createRule(
        s.ctx,
        base(id, { action: { type: 'set_adset_budget', changePct: '10', maxDailyBudget: '9', floorDailyBudget: '1' } }),
        clock,
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(
      createRule(
        s.ctx,
        base(id, { templateKey: 'sunset_loser', action: { type: 'set_adset_budget', changePct: '-15' } }),
        clock,
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(
      createRule(s.ctx, base(id, { level: 'ad', action: { type: 'suggest_resume', changePct: '5' } }), clock),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(createRule(s.ctx, base(id, { guardrails: { cooldownHours: 12 } }), clock)).rejects.toThrow();
    // Hợp lệ: vẫn luôn tạo ở shadow.
    const ok = await createRule(
      s.ctx,
      base(id, { level: 'ad', action: { type: 'pause_ad', revert: { kind: 'suggest_undo', hour: 7 } } }),
      clock,
    );
    expect(ok.mode).toBe('shadow');
  });

  it('4 mẫu tactic có trong thư viện; Revive không ghi Meta, Surf cần trần, Sunsetting cần sàn', () => {
    const t = Object.fromEntries(RULE_TEMPLATES.filter((x) => x.tactic).map((x) => [x.key, x]));
    expect(Object.keys(t).sort()).toEqual(['revive_paused', 'stop_loss_no_clicks', 'sunset_loser', 'surf_winner']);
    expect(t.revive_paused!.action.type).toBe('suggest_resume');
    expect(t.surf_winner!.requiresMaxDailyBudget).toBe(true);
    expect(t.surf_winner!.action.revert).toEqual({ kind: 'restore_budget', hour: 21 });
    expect(t.sunset_loser!.requiresFloorDailyBudget).toBe(true);
    expect(t.stop_loss_no_clicks!.action.revert).toEqual({ kind: 'suggest_undo', hour: 7 });
  });
});

describe('lịch chạy theo ngày / giờ trong tuần', () => {
  it('đúng ngày + khung giờ theo giờ tài khoản; không đặt lịch = luôn chạy', () => {
    const fri10 = new Date('2026-10-23T03:00:00Z'); // T6 10:00 giờ VN
    const sched = { days: [1, 2, 3, 4, 5], startHour: 8, endHour: 20 };
    expect(inRuleSchedule(undefined, fri10, 'Asia/Ho_Chi_Minh')).toBe(true);
    expect(inRuleSchedule(sched, fri10, 'Asia/Ho_Chi_Minh')).toBe(true);
    expect(inRuleSchedule({ ...sched, startHour: 11 }, fri10, 'Asia/Ho_Chi_Minh')).toBe(false);
    expect(inRuleSchedule(sched, new Date('2026-10-24T03:00:00Z'), 'Asia/Ho_Chi_Minh')).toBe(false); // T7
    // Cùng thời điểm ở New York là T5 23:00.
    expect(inRuleSchedule(sched, fri10, 'America/New_York')).toBe(false);
  });

  it('ngoài lịch → không đánh giá, không tạo hành động; trong lịch → chạy', async () => {
    const s = await setup();
    const r = await s.rule({ guardrails: { maxActionsPerDay: 1, schedule: { days: [6], startHour: 8, endHour: 20 } } });
    expect(await liveEvaluate(s.wctx, r.id, { enqueue: s.enqueue, clock })).toEqual({ status: 'outside_schedule' });
    expect(await actionsOf(r.id)).toEqual([]);
    const sat = at('2026-10-24T03:00:00Z');
    expect(await liveEvaluate(s.wctx, r.id, { enqueue: s.enqueue, clock: sat })).toEqual({
      status: 'evaluated',
      created: 1,
    });
  });
});
