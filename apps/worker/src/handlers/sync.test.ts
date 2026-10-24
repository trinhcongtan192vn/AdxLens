import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { keysFromEnv, importAccounts, saveConnection } from '@adxlens/core/connections';
import { startBackfill } from '@adxlens/core/ingestion';
import { dueDailySyncs } from '@adxlens/core/ops';
import { resolveActor } from '@adxlens/core/tenancy';
import { schema } from '@adxlens/db';
import { closeTestDb, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { MOCK_ACCOUNTS } from '@adxlens/meta-client/mock';
import { dispatch } from '../dispatch';
import type { HandlerMap } from '../handler';
import { handlers } from './index';
import { TEST_TOKEN_KEY, testWorkerServices } from '../testing';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());

async function importOne(act: string) {
  const { workspace, owner } = await seedWorkspace(db);
  const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
  const { connectionId } = await saveConnection(
    ctx,
    { token: 'mock-read-w', expiresAt: null, scopes: ['ads_read'], metaUser: { id: 'mw' }, accounts: MOCK_ACCOUNTS },
    keysFromEnv({ TOKEN_ENC_KEY_V1: TEST_TOKEN_KEY }),
  );
  const [a] = await importAccounts(ctx, { connectionId, metaAccountIds: [act] });
  return { ctx, adAccountId: a!.adAccountId };
}

describe('worker: đồng bộ', () => {
  it('chạy mọi lô backfill qua dispatch → tài khoản ok, có insight', async () => {
    const { ctx, adAccountId } = await importOne('act_100000003');
    const { services, enqueue } = testWorkerServices(db);
    await startBackfill(ctx, adAccountId, { enqueue: services.enqueue });
    // Chạy hàng đợi tới khi rỗng: backfill xong → reconcile:account được enqueue và chạy.
    for (let i = 0; i < enqueue.calls.length; i++) {
      const c = enqueue.calls[i]!;
      await dispatch(handlers, services, { name: c.name, id: `j${i}`, data: c.payload });
    }
    expect(enqueue.calls.filter((c) => c.name === 'reconcile:account')).toHaveLength(1);
    const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.reconciliationResults);
    expect(r!.n).toBe(90);
    const [acc] = await db.select().from(schema.adAccounts).where(eq(schema.adAccounts.id, adAccountId));
    expect(acc!.syncStatus).toBe('ok');
    const [n] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.insightsDaily);
    expect(n!.n).toBeGreaterThan(0);
  });

  it('finalAttempt chỉ true ở lần thử cuối', async () => {
    const seen: boolean[] = [];
    const probe: HandlerMap = {
      'ops:health_check': async (_p, d) => {
        seen.push(d.finalAttempt);
      },
    };
    const { services } = testWorkerServices(db);
    const job = { name: 'ops:health_check', id: 'x', data: { tick: 't' } };
    await dispatch(probe, services, { ...job, attempt: 1, maxAttempts: 5 });
    await dispatch(probe, services, { ...job, attempt: 5, maxAttempts: 5 });
    expect(seen).toEqual([false, true]);
  });

  it('scheduler: chỉ tài khoản đang 03:00 giờ địa phương, ngày = hôm qua theo múi giờ đó', async () => {
    const vn = await importOne('act_100000001');
    const us = await importOne('act_100000002');
    await db
      .update(schema.adAccounts)
      .set({ timezone: 'America/New_York' })
      .where(eq(schema.adAccounts.id, us.adAccountId));
    // 20:10Z 22/10 = 03:10 23/10 ở Việt Nam, 16:10 22/10 ở New York.
    const due = await dueDailySyncs(db, new Date('2026-10-22T20:10:00Z'));
    expect(due).toEqual([{ workspaceId: vn.ctx.workspaceId, adAccountId: vn.adAccountId, date: '2026-10-22' }]);

    const { services, enqueue } = testWorkerServices(db);
    await dispatch(handlers, services, { name: 'maintenance:daily_sync_tick', id: 't', data: { tick: 'now' } });
    // Giờ thật của máy test có thể không phải 03:00 → chỉ kiểm mọi lệnh enqueue đều đúng loại job.
    expect(enqueue.calls.every((c) => c.name === 'sync:daily_account')).toBe(true);
  });

  it('scheduler bỏ qua kết nối hết hạn', async () => {
    const vn = await importOne('act_100000001');
    await db.update(schema.metaConnections).set({ status: 'expired' });
    expect(await dueDailySyncs(db, new Date('2026-10-22T20:10:00Z'))).toEqual([]);
    expect(vn.adAccountId).toBeTruthy();
  });
});
