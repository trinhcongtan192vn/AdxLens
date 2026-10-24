import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import {
  closeTestDb,
  seedAdAccount,
  seedClient,
  seedConnection,
  seedWorkspace,
  testDb,
  truncateAll,
} from '@adxlens/db/testing';
import { listRules } from '@adxlens/core/execution';
import { resolveActor } from '@adxlens/core/tenancy';
import { clientsNeedingAttention, setClientBudget, type ClientRowOverview } from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());

const clock = { now: () => new Date('2026-10-20T05:00:00Z') };

async function setup() {
  const { workspace, owner } = await seedWorkspace(db);
  const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
  const conn = await seedConnection(db, workspace.id, owner.id);
  const a = await seedClient(db, workspace.id, 'Khách A');
  const b = await seedClient(db, workspace.id, 'Khách B');
  const accA = await seedAdAccount(db, workspace.id, conn.id, { clientId: a.id, confirmed: true });
  const accB = await seedAdAccount(db, workspace.id, conn.id, { clientId: b.id, confirmed: true });
  return { ctx, a, b, accA, accB, owner, ws: workspace.id };
}

const row = (
  id: string,
  name: string,
  accountId: string,
  over: Partial<ClientRowOverview> = {},
  recon: 'ok' | 'warning' = 'ok',
): ClientRowOverview => ({
  id,
  name,
  accounts: [
    {
      id: accountId,
      name: 'acc',
      currency: 'VND',
      timezone: 'Asia/Ho_Chi_Minh',
      clientId: id,
      confirmed: true,
      spend7: '0',
      spendPrev7: '0',
      spend30: '0',
      health: 90,
      highIssues: 0,
      recon: { status: recon, maxSpendDeltaPct: recon === 'warning' ? '1.400000' : '0.100000' },
    },
  ],
  spend7: {},
  spendPrev7: {},
  spend30: {},
  health: 90,
  highIssues: 0,
  ...over,
});

describe('khách cần chú ý (G3)', () => {
  it('gom tín hiệu theo khách, xếp lệch số / đồng bộ lỗi lên đầu; khách ổn không hiện', async () => {
    const { ctx, a, b, accA, accB } = await setup();
    await db.update(schema.adAccounts).set({ syncStatus: 'error' }).where(eq(schema.adAccounts.id, accB.id));
    // Ngân sách tháng thấp hơn hẳn (không có chi tiêu → dự kiến thiếu).
    await setClientBudget(ctx, { clientId: a.id, month: '2026-10', amount: '5000000', currency: 'VND' });
    const out = await clientsNeedingAttention(
      ctx,
      [row(a.id, 'Khách A', accA.id, { highIssues: 2, health: 50 }), row(b.id, 'Khách B', accB.id, {}, 'warning')],
      clock,
    );
    expect(out.map((x) => x.name)).toEqual(['Khách B', 'Khách A']);
    expect(out[0]!.reasons.map((r) => r.kind)).toEqual(['recon_warning', 'sync_error']);
    expect(out[1]!.reasons.map((r) => r.kind)).toEqual(['high_issues', 'budget', 'low_health']);
    // Khách ổn (không lệch, không lỗi, không ngân sách lệch, health tốt) → không hiện.
    const { ctx: ctx2, a: ok, accA: okAcc } = await setup();
    expect(await clientsNeedingAttention(ctx2, [row(ok.id, 'Khách ổn', okAcc.id)], clock)).toEqual([]);
  });

  it('danh sách lọc theo khách: rule chỉ của tài khoản thuộc khách đó', async () => {
    const { ctx, a, accA, accB, owner, ws } = await setup();
    const rule = (adAccountId: string, name: string) => ({
      workspaceId: ws,
      adAccountId,
      name,
      level: 'ad' as const,
      condition: [{ metric: 'spend', op: 'gte', value: '0' }],
      action: { type: 'pause_ad' },
      guardrails: {},
      createdBy: owner.id,
    });
    await db.insert(schema.automationRules).values([rule(accA.id, 'Rule A'), rule(accB.id, 'Rule B')]);
    expect((await listRules(ctx)).map((r) => r.name).sort()).toEqual(['Rule A', 'Rule B']);
    expect((await listRules(ctx, { clientId: a.id })).map((r) => r.name)).toEqual(['Rule A']);
  });
});
