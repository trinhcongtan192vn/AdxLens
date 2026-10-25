import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@adxlens/db';
import { closeTestDb, seedAdAccount, seedConnection, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { resolveActor } from '@adxlens/core/tenancy';
import { automationKind, automationOverview } from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());
const now = new Date('2026-10-23T10:00:00Z');

async function setup(name: string) {
  const { workspace, owner } = await seedWorkspace(db, name);
  const conn = await seedConnection(db, workspace.id, owner.id, `m-${name}`);
  const acc = await seedAdAccount(db, workspace.id, conn.id, { metaAccountId: `act_${name.length}0001`, name });
  const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
  return { ctx, acc, workspaceId: workspace.id };
}

async function action(
  workspaceId: string,
  adAccountId: string,
  ruleId: string | null,
  actionType: string,
  hoursAgo: number,
  budget?: [string, string],
) {
  await db.insert(schema.actions).values({
    workspaceId,
    adAccountId,
    ruleId,
    actionType,
    targetType: actionType.endsWith('_ad') ? 'ad' : 'adset',
    targetMetaId: '123',
    tier: ruleId ? 'auto' : 'approve',
    params: {},
    beforeState: budget ? { daily_budget: budget[0] } : { status: 'ACTIVE' },
    afterExpected: budget ? { daily_budget: budget[1] } : { status: 'PAUSED' },
    idempotencyKey: randomUUID(),
    createdAt: new Date(now.getTime() - hoursAgo * 3_600_000),
  });
}

describe('tổng quan tự động hóa (cải tiến cổ điển, Madgicx 3.2)', () => {
  it('đếm hành động do rule 7 ngày theo loại, theo ngày, theo rule (48h / 7d / lần cuối); bỏ hành động duyệt tay', async () => {
    const { ctx, acc, workspaceId } = await setup('A');
    const r1 = randomUUID();
    const r2 = randomUUID();
    await action(workspaceId, acc.id, r1, 'pause_ad', 2);
    await action(workspaceId, acc.id, r1, 'pause_adset', 30);
    await action(workspaceId, acc.id, r1, 'resume_ad', 100);
    await action(workspaceId, acc.id, r2, 'set_adset_budget', 5, ['100000', '120000']);
    await action(workspaceId, acc.id, r2, 'set_adset_budget', 6, ['100000', '80000']);
    await action(workspaceId, acc.id, r2, 'pause_ad', 24 * 9);
    await action(workspaceId, acc.id, null, 'pause_ad', 1);
    const o = await automationOverview(ctx, { now: () => now });
    expect(o.counts).toEqual({ start: 1, pause: 2, increase_budget: 1, decrease_budget: 1, other: 0 });
    expect(o.daily).toHaveLength(7);
    expect(o.daily.reduce((t, d) => t + Object.values(d.counts).reduce((x, y) => x + y, 0), 0)).toBe(5);
    expect(o.perRule.get(r1)).toMatchObject({ last48h: 2, last7d: 3 });
    expect(o.perRule.get(r2)).toMatchObject({ last48h: 2, last7d: 2 });
  });

  it('cách ly workspace', async () => {
    const a = await setup('A');
    const b = await setup('BB');
    await action(a.workspaceId, a.acc.id, randomUUID(), 'pause_ad', 1);
    const o = await automationOverview(b.ctx, { now: () => now });
    expect(Object.values(o.counts).reduce((x, y) => x + y, 0)).toBe(0);
  });

  it('phân loại', () => {
    const k = (actionType: string, b?: string, a?: string) =>
      automationKind({
        actionType,
        beforeState: { daily_budget: b ?? null },
        afterExpected: { daily_budget: a ?? null },
      });
    expect([
      k('pause_ad'),
      k('resume_adset'),
      k('set_adset_budget', '1', '2'),
      k('set_adset_budget', '2', '1'),
    ]).toEqual(['pause', 'start', 'increase_budget', 'decrease_budget']);
  });
});
