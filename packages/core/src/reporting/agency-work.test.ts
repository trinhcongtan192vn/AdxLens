import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@adxlens/db';
import { closeTestDb, seedAdAccount, seedConnection, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { agencyWork } from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());

const period = { from: '2026-10-01', to: '2026-10-07' };

async function setup() {
  const { workspace, owner } = await seedWorkspace(db);
  const conn = await seedConnection(db, workspace.id, owner.id);
  const acc = await seedAdAccount(db, workspace.id, conn.id, { name: 'Cà phê Nhà Rang' });
  return { workspace, acc, ctx: { db, workspaceId: workspace.id } };
}

let n = 0;
function action(workspaceId: string, adAccountId: string, over: Partial<typeof schema.actions.$inferInsert>) {
  n += 1;
  return {
    workspaceId,
    adAccountId,
    actionType: 'pause_ad',
    targetType: 'ad' as const,
    targetMetaId: `ad_${n}`,
    targetName: `Ad ${n}`,
    tier: 'approve' as const,
    params: {},
    beforeState: { status: 'ACTIVE' },
    afterExpected: { status: 'PAUSED' },
    idempotencyKey: `k-${n}-${Math.random()}`,
    status: 'success' as const,
    ...over,
  };
}

function rec(workspaceId: string, adAccountId: string, doneAt: Date | null, status: 'done' | 'proposed' = 'done') {
  n += 1;
  return {
    workspaceId,
    adAccountId,
    week: '2026-09-28',
    source: 'finding' as const,
    sourceKey: 'creative_fatigue',
    entityType: 'ad',
    metaId: `ad_r${n}`,
    entityName: `Ad R${n}`,
    action: { key: 'weekly.actions.creative_winner' },
    why: { key: 'weekly.actions.creative_winner' },
    evidence: {},
    confidence: '0.800',
    effortMinutes: 10,
    score: '1',
    status,
    doneAt,
  };
}

describe('agency đã làm gì trong kỳ (A2)', () => {
  it('lấy thay đổi Meta đã thực hiện + việc đã xong trong kỳ theo ngày giờ tài khoản; bỏ ngoài kỳ, bản hoàn tác, việc chưa xong', async () => {
    const { workspace, acc, ctx } = await setup();
    const ws = workspace.id;
    // Asia/Ho_Chi_Minh: 2026-10-07T20:00Z = 08/10 giờ VN → ngoài kỳ.
    await db.insert(schema.actions).values([
      action(ws, acc.id, { executedAt: new Date('2026-10-02T03:00:00Z') }),
      action(ws, acc.id, {
        actionType: 'set_adset_budget',
        targetType: 'adset',
        tier: 'auto',
        beforeState: { daily_budget: '300000' },
        afterExpected: { daily_budget: '345000' },
        executedAt: new Date('2026-10-05T03:00:00Z'),
      }),
      action(ws, acc.id, { status: 'undone', executedAt: new Date('2026-10-06T03:00:00Z') }),
      action(ws, acc.id, { executedAt: new Date('2026-10-07T20:00:00Z') }),
      action(ws, acc.id, { status: 'failed', executedAt: new Date('2026-10-03T03:00:00Z') }),
      action(ws, acc.id, { status: 'pending' }),
    ]);
    await db
      .insert(schema.recommendations)
      .values([
        rec(ws, acc.id, new Date('2026-10-03T03:00:00Z')),
        rec(ws, acc.id, new Date('2026-09-20T03:00:00Z')),
        rec(ws, acc.id, null, 'proposed'),
      ]);

    const w = await agencyWork(ctx, [acc.id], period);
    expect(w!.totals).toEqual({ actions: 3, tasks: 1 });
    expect(w!.actions.map((a) => [a.date, a.actionType, a.tier, a.undone])).toEqual([
      ['2026-10-02', 'pause_ad', 'approve', false],
      ['2026-10-05', 'set_adset_budget', 'auto', false],
      ['2026-10-06', 'pause_ad', 'approve', true],
    ]);
    expect(w!.actions[1]).toMatchObject({ beforeState: { daily_budget: '300000' }, currency: 'VND' });
    expect(w!.tasks).toEqual([
      expect.objectContaining({ date: '2026-10-03', action: { key: 'weekly.actions.creative_winner' } }),
    ]);
  });

  it('không có gì trong kỳ → null; không đọc tài khoản của workspace khác', async () => {
    const a = await setup();
    const b = await setup();
    await db
      .insert(schema.actions)
      .values(action(b.workspace.id, b.acc.id, { executedAt: new Date('2026-10-02T03:00:00Z') }));
    expect(await agencyWork(a.ctx, [a.acc.id], period)).toBeNull();
    // Truyền nhầm id tài khoản của B với ngữ cảnh A vẫn không lấy được dữ liệu B.
    expect(await agencyWork(a.ctx, [b.acc.id], period)).toBeNull();
    expect(await agencyWork(a.ctx, [], period)).toBeNull();
  });
});
