import { and, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@adxlens/db';
import {
  closeTestDb,
  seedAdAccount,
  seedClient,
  seedConnection,
  seedMember,
  seedStaff,
  seedWorkspace,
  testDb,
  truncateAll,
} from '@adxlens/db/testing';
import { enableFlag, runChecklist } from '@adxlens/core/flags';
import { listNotifications } from '@adxlens/core/notification';
import { addDays } from '@adxlens/core/shared';
import { resolveActor } from '@adxlens/core/tenancy';
import {
  generateWeeklyActions,
  isWeeklyActionsDue,
  listWeeklyActions,
  priorityScore,
  registerRecommendationFlagChecks,
  reviewQueue,
  updateWeeklyAction,
} from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());

// Thứ Hai 26/10/2026 07:00 giờ Việt Nam.
const NOW = new Date('2026-10-26T00:00:00Z');
const clock = { now: () => NOW };
const WEEK = '2026-10-26';
const YESTERDAY = '2026-10-25';

async function setup() {
  const { workspace, owner } = await seedWorkspace(db);
  const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
  const conn = await seedConnection(db, workspace.id, owner.id);
  const clientA = await seedClient(db, workspace.id, 'Client A');
  const clientB = await seedClient(db, workspace.id, 'Client B');
  const accA = await seedAdAccount(db, workspace.id, conn.id, { clientId: clientA.id, confirmed: true, name: 'TK A' });
  const accB = await seedAdAccount(db, workspace.id, conn.id, { clientId: clientB.id, confirmed: true, name: 'TK B' });
  // 7 ngày chi tiêu 1.000.000đ/ngày cho mỗi tài khoản (nền để tính tác động tương đối).
  for (const acc of [accA, accB]) {
    await db.insert(schema.insightsDaily).values(
      Array.from({ length: 7 }, (_, i) => ({
        workspaceId: workspace.id,
        adAccountId: acc.id,
        entityType: 'ad' as const,
        metaId: 'base-ad',
        date: addDays(YESTERDAY, -i),
        spend: '1000000',
        attributionWindow: '7d_click_1d_view',
      })),
    );
  }
  const finding = async (
    accountId: string,
    ruleId: string,
    metaId: string,
    impact: string | null,
    severity: 'high' | 'medium' | 'low' = 'medium',
  ) =>
    (
      await db
        .insert(schema.findings)
        .values({
          workspaceId: workspace.id,
          adAccountId: accountId,
          ruleId,
          ruleGroup: 'test',
          entityType: 'adset',
          metaId,
          entityName: `Đối tượng ${metaId}`,
          severity,
          impactEstimate: impact,
          evidence: { metrics: {} },
          explanation: {
            why: { key: `rules.${ruleId}.why` },
            whatToDo: { key: `rules.${ruleId}.what` },
            deepLink: null,
          },
          snapshotVersion: 'v1',
          lastSeenAt: NOW,
        })
        .returning()
    )[0]!;
  return { ctx, workspaceId: workspace.id, owner, accA, accB, clientA, clientB, finding };
}

describe('điểm ưu tiên (PRD 10.3)', () => {
  it('= tác động tương đối × độ tin cậy ÷ giờ công × hệ số "sai"', () => {
    const base = { accountSpend7d: '7000000', severity: 'medium' as const, wrongMultiplier: 1 };
    // 700.000 / 7.000.000 = 10% × 0,8 ÷ 0,25 giờ = 0,32
    expect(priorityScore({ ...base, impactEstimate: '700000', confidence: 0.8, effortMinutes: 15 })).toBeCloseTo(0.32);
    // không có tiền → theo mức độ (medium 5%) × 0,9 ÷ (10/60)
    expect(priorityScore({ ...base, impactEstimate: null, confidence: 0.9, effortMinutes: 10 })).toBeCloseTo(0.27);
    expect(
      priorityScore({ ...base, impactEstimate: '700000', confidence: 0.8, effortMinutes: 15, wrongMultiplier: 0.5 }),
    ).toBeCloseTo(0.16);
  });
});

describe('Weekly Action List (P1-04)', () => {
  it('tạo từ phát hiện đang mở, xếp theo điểm; chạy lại không nhân đôi và giữ trạng thái', async () => {
    const { ctx, accA, finding } = await setup();
    await finding(accA.id, 'spend_no_conversion', 's1', '1400000', 'high');
    await finding(accA.id, 'account_hygiene', 'h1', null, 'low');
    await finding(accA.id, 'fragmentation', 'f1', null, 'medium');
    const r = await generateWeeklyActions(ctx, WEEK, { clock });
    expect(r.total).toBe(3);
    const list = await listWeeklyActions(ctx);
    expect(list.week).toBe(WEEK);
    expect(list.items.map((i) => i.sourceKey)).toEqual(['spend_no_conversion', 'account_hygiene', 'fragmentation']);
    expect(list.items[0]).toMatchObject({ confidence: '0.800', effortMinutes: 15, accountName: 'TK A' });
    await updateWeeklyAction(ctx, list.items[0]!.id, { status: 'in_progress' }, { clock });
    await generateWeeklyActions(ctx, WEEK, { clock });
    const again = await listWeeklyActions(ctx);
    expect(again.items).toHaveLength(3);
    expect(again.items[0]!.status).toBe('in_progress');
  });

  it('phát hiện đã xong/bỏ qua không vào danh sách; tuần phải là thứ Hai', async () => {
    const { ctx, accA, finding } = await setup();
    const f = await finding(accA.id, 'learning_limited', 'l1', null);
    await db.update(schema.findings).set({ status: 'done' }).where(eq(schema.findings.id, f.id));
    expect((await generateWeeklyActions(ctx, WEEK, { clock })).total).toBe(0);
    await expect(generateWeeklyActions(ctx, '2026-10-27', { clock })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it('bỏ qua vì "sai" giảm xếp hạng loại gợi ý đó ở tuần sau và đưa vào rà soát', async () => {
    const { ctx, accA, finding } = await setup();
    for (let i = 0; i < 5; i++) await finding(accA.id, 'starved_winner', `w${i}`, null);
    await finding(accA.id, 'learning_limited', 'l1', null);
    await generateWeeklyActions(ctx, WEEK, { clock });
    const first = await listWeeklyActions(ctx);
    const before = Number(first.items.find((i) => i.sourceKey === 'starved_winner')!.score);
    for (const it of first.items.filter((i) => i.sourceKey === 'starved_winner')) {
      await updateWeeklyAction(ctx, it.id, { status: 'skipped', skipReason: 'wrong' }, { clock });
    }
    const next = { now: () => new Date(NOW.getTime() + 7 * 86_400_000) };
    await generateWeeklyActions(ctx, '2026-11-02', { clock: next });
    const after = await listWeeklyActions(ctx, { week: '2026-11-02' });
    const score = Number(after.items.find((i) => i.sourceKey === 'starved_winner')!.score);
    expect(score).toBeCloseTo(before * 0.3, 5);
    expect(after.items[0]!.sourceKey).toBe('learning_limited');
    expect((await reviewQueue(ctx, next)).map((r) => r.sourceKey)).toEqual(['starved_winner']);
  });

  it('thông báo "việc tuần này" theo phạm vi Client của từng người (P1-09)', async () => {
    const { ctx, workspaceId, owner, accA, accB, clientA, finding } = await setup();
    const buyer = await seedMember(db, workspaceId, 'buyer', [clientA.id]);
    await finding(accA.id, 'account_hygiene', 'h1', null);
    await finding(accB.id, 'account_hygiene', 'h2', null);
    await finding(accB.id, 'learning_limited', 'l2', null);
    await generateWeeklyActions(ctx, WEEK, { clock });
    const ownerNote = (await listNotifications(ctx, owner.id)).find((n) => n.kind === 'weekly_actions');
    const buyerNote = (await listNotifications(ctx, buyer.id)).find((n) => n.kind === 'weekly_actions');
    expect(ownerNote?.params).toMatchObject({ count: 3 });
    expect(buyerNote?.params).toMatchObject({ count: 1 });
  });
});

describe('trạng thái và gán việc (P1-05)', () => {
  it('bỏ qua cần lý do; đã làm ghi thời điểm; buyer chỉ thấy và sửa việc của Client được gán', async () => {
    const { ctx, workspaceId, accA, accB, clientA, finding } = await setup();
    await finding(accA.id, 'account_hygiene', 'h1', null);
    await finding(accB.id, 'account_hygiene', 'h2', null);
    await generateWeeklyActions(ctx, WEEK, { clock });
    const items = (await listWeeklyActions(ctx)).items;
    const a = items.find((i) => i.adAccountId === accA.id)!;
    const b = items.find((i) => i.adAccountId === accB.id)!;
    await expect(updateWeeklyAction(ctx, a.id, { status: 'skipped' })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    const done = await updateWeeklyAction(ctx, a.id, { status: 'done' }, { clock });
    expect(done.doneAt?.toISOString()).toBe(NOW.toISOString());

    const buyer = await seedMember(db, workspaceId, 'buyer', [clientA.id]);
    const bctx = { db, workspaceId, actor: (await resolveActor(db, workspaceId, buyer.id))! };
    expect((await listWeeklyActions(bctx)).items.map((i) => i.id)).toEqual([a.id]);
    await expect(updateWeeklyAction(bctx, b.id, { status: 'done' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('chỉ gán cho người xem được Client; người được gán nhận thông báo', async () => {
    const { ctx, workspaceId, accA, clientA, clientB, finding } = await setup();
    await finding(accA.id, 'account_hygiene', 'h1', null);
    await generateWeeklyActions(ctx, WEEK, { clock });
    const [item] = (await listWeeklyActions(ctx)).items;
    const other = await seedMember(db, workspaceId, 'buyer', [clientB.id]);
    await expect(updateWeeklyAction(ctx, item!.id, { assigneeId: other.id })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    const buyer = await seedMember(db, workspaceId, 'buyer', [clientA.id]);
    await updateWeeklyAction(ctx, item!.id, { assigneeId: buyer.id });
    const notes = await listNotifications(ctx, buyer.id);
    expect(notes.some((n) => n.kind === 'action_assigned')).toBe(true);
    expect((await listWeeklyActions(ctx, { assignee: buyer.id })).items).toHaveLength(1);
  });

  it('cách ly: không sửa được gợi ý của workspace khác', async () => {
    const a = await setup();
    const b = await setup();
    await b.finding(b.accA.id, 'account_hygiene', 'h1', null);
    await generateWeeklyActions(b.ctx, WEEK, { clock });
    const [item] = (await listWeeklyActions(b.ctx)).items;
    await expect(updateWeeklyAction(a.ctx, item!.id, { status: 'done' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await listWeeklyActions(a.ctx)).items).toHaveLength(0);
    const [row] = await db
      .select()
      .from(schema.recommendations)
      .where(and(eq(schema.recommendations.id, item!.id)));
    expect(row!.status).toBe('proposed');
  });
});

describe('lịch và checklist cờ P1', () => {
  it('tạo vào thứ Hai 07:00 theo múi giờ workspace', () => {
    expect(isWeeklyActionsDue('Asia/Ho_Chi_Minh', new Date('2026-10-26T00:10:00Z'))).toBe(true);
    expect(isWeeklyActionsDue('Asia/Ho_Chi_Minh', new Date('2026-10-26T01:10:00Z'))).toBe(false);
    expect(isWeeklyActionsDue('Asia/Ho_Chi_Minh', new Date('2026-10-27T00:10:00Z'))).toBe(false);
  });

  it('checklist: P0 bật ≥ 14 ngày; tỷ lệ phát hiện "sai" ≤ 20%', async () => {
    const { workspaceId } = await setup();
    const pm = await seedStaff(db, true);
    registerRecommendationFlagChecks({ now: () => new Date(Date.now() + 15 * 86_400_000) });
    const before = await runChecklist(db, workspaceId, 'p1_recommendations');
    expect(before.find((c) => c.id === 'p0_enabled_14d')?.passed).toBe(false);
    await enableFlag(db, {
      workspaceId,
      key: 'p0_reports',
      staffUserId: pm.id,
      reason: 'design partner',
      override: true,
    });
    const after = await runChecklist(db, workspaceId, 'p1_recommendations');
    expect(after.find((c) => c.id === 'p0_enabled_14d')?.passed).toBe(true); // đồng hồ +15 ngày
    expect(after.find((c) => c.id === 'wrong_rate_20')?.passed).toBe(true);
  });
});
