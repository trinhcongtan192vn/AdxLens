import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeTestDb, seedMember, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { recordingEnqueue } from '@adxlens/jobs';
import { MOCK_ACCOUNTS, MockMetaRead } from '@adxlens/meta-client/mock';
import { importAccounts, keysFromEnv, saveConnection } from '@adxlens/core/connections';
import { startBackfill, syncRange } from '@adxlens/core/ingestion';
import { addDays } from '@adxlens/core/shared';
import { resolveActor } from '@adxlens/core/tenancy';
import { creativeFormatTrend } from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());
const KEYS = keysFromEnv({ TOKEN_ENC_KEY_V1: Buffer.alloc(32, 8).toString('base64') });
const now = () => new Date('2026-10-23T03:00:00Z');
const END = '2026-10-22';

describe('Creative Insights: xu hướng theo tuần', () => {
  it('tuần sắp tăng dần; tỷ trọng mỗi tuần ~100%; tổng chi = insight trong kỳ; buyer không thấy gì', async () => {
    const { workspace, owner } = await seedWorkspace(db);
    const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
    const { connectionId } = await saveConnection(
      ctx,
      { token: 'mock-read-tr', expiresAt: null, scopes: ['ads_read'], metaUser: { id: 'tr' }, accounts: MOCK_ACCOUNTS },
      KEYS,
    );
    const [a] = await importAccounts(ctx, { connectionId, metaAccountIds: ['act_100000001'] });
    const enqueue = recordingEnqueue();
    await startBackfill(ctx, a!.adAccountId, { enqueue, clock: { now } });
    for (const c of enqueue.calls.slice(0, 2)) {
      await syncRange(ctx, c.payload as never, { meta: new MockMetaRead(now), keys: KEYS.keys });
    }
    const w = await creativeFormatTrend(ctx, [a!.adAccountId], END, 4);
    expect(w.length).toBeGreaterThan(1);
    expect(w.map((x) => x.week)).toEqual([...w.map((x) => x.week)].sort());
    for (const x of w) {
      const s = x.formats.reduce((t, f) => t + f.spendShare, 0);
      expect(s).toBeGreaterThan(99.5);
      expect(s).toBeLessThan(100.5);
    }
    const [raw] = await db.execute<{ spend: string }>(sql`
      select sum(spend)::text as spend from analytics.insights_daily
      where workspace_id = ${workspace.id} and entity_type = 'ad' and date between ${addDays(END, -27)} and ${END}`);
    const total = w.flatMap((x) => x.formats).reduce((t, f) => t + Number(f.spend), 0);
    expect(total).toBeCloseTo(Number(raw!.spend), 2);

    const buyer = await seedMember(db, workspace.id, 'buyer');
    const bctx = { ...ctx, actor: (await resolveActor(db, workspace.id, buyer.id))! };
    expect(await creativeFormatTrend(bctx, [a!.adAccountId], END, 4)).toEqual([]);
  });
});
