import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeTestDb, seedMember, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { recordingEnqueue } from '@adxlens/jobs';
import { MOCK_ACCOUNTS, MockMetaRead } from '@adxlens/meta-client/mock';
import { importAccounts, keysFromEnv, saveConnection } from '@adxlens/core/connections';
import { startBackfill, syncRange } from '@adxlens/core/ingestion';
import { resolveActor } from '@adxlens/core/tenancy';
import { businessDashboard } from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());
const KEYS = keysFromEnv({ TOKEN_ENC_KEY_V1: Buffer.alloc(32, 8).toString('base64') });
const now = () => new Date('2026-10-23T03:00:00Z');
const cur = { from: '2026-10-16', to: '2026-10-22' };
const prev = { from: '2026-10-09', to: '2026-10-15' };

async function setup() {
  const { workspace, owner } = await seedWorkspace(db);
  const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
  const { connectionId } = await saveConnection(
    ctx,
    { token: 'mock-read-biz', expiresAt: null, scopes: ['ads_read'], metaUser: { id: 'biz' }, accounts: MOCK_ACCOUNTS },
    KEYS,
  );
  const imported = await importAccounts(ctx, { connectionId, metaAccountIds: ['act_100000001', 'act_100000002'] });
  for (const a of imported) {
    const enqueue = recordingEnqueue();
    await startBackfill(ctx, a.adAccountId, { enqueue, clock: { now } });
    for (const c of enqueue.calls.slice(0, 2)) {
      await syncRange(ctx, c.payload as never, { meta: new MockMetaRead(now), keys: KEYS.keys });
    }
  }
  return { ctx, ids: imported.map((a) => a.adAccountId), workspaceId: workspace.id };
}

describe('Business Dashboard (Madgicx 3.3)', () => {
  it('tổng hợp = tổng insight các tài khoản; khối theo từng tài khoản; AOV = doanh thu / số mua', async () => {
    const { ctx, ids } = await setup();
    const d = await businessDashboard(ctx, ids, cur, prev);
    const [raw] = await db.execute<{ spend: string }>(sql`
      select sum(spend)::text as spend from analytics.insights_daily
      where workspace_id = ${ctx.workspaceId} and entity_type = 'ad' and date between ${cur.from} and ${cur.to}`);
    expect(Number(d.blended.values.spend)).toBeCloseTo(Number(raw!.spend), 2);
    expect(d.accounts).toHaveLength(2);
    const sum = d.accounts.reduce((s, a) => s + Number(a.block.values.spend ?? 0), 0);
    expect(sum).toBeCloseTo(Number(d.blended.values.spend), 2);
    for (const a of d.accounts) {
      const v = a.block.values;
      if (v.purchases && Number(v.purchases) > 0) {
        expect(Number(v.aov)).toBeCloseTo(Number(v.purchase_value) / Number(v.purchases), 1);
      } else expect(v.aov).toBeNull();
    }
    expect(typeof d.blended.changes.spend === 'number' || d.blended.changes.spend === null).toBe(true);
  });

  it('buyer chưa được gán khách: không thấy tài khoản nào, tổng rỗng', async () => {
    const { ctx, ids, workspaceId } = await setup();
    const buyer = await seedMember(db, workspaceId, 'buyer');
    const bctx = { ...ctx, actor: (await resolveActor(db, workspaceId, buyer.id))! };
    const d = await businessDashboard(bctx, ids, cur, prev);
    expect(d.accounts).toEqual([]);
    expect(Number(d.blended.values.spend ?? 0)).toBe(0);
  });
});
