import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeTestDb, seedMember, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { recordingEnqueue } from '@adxlens/jobs';
import { MOCK_ACCOUNTS, MockMetaRead } from '@adxlens/meta-client/mock';
import { importAccounts, keysFromEnv, saveConnection } from '@adxlens/core/connections';
import { startBackfill, syncRange } from '@adxlens/core/ingestion';
import { resolveActor } from '@adxlens/core/tenancy';
import { accountKpis, dailySeries, entityTable, toKpis } from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());
const KEYS = keysFromEnv({ TOKEN_ENC_KEY_V1: Buffer.alloc(32, 8).toString('base64') });
const now = () => new Date('2026-10-23T03:00:00Z');

async function synced() {
  const { workspace, owner } = await seedWorkspace(db);
  const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
  const { connectionId } = await saveConnection(
    ctx,
    { token: 'mock-read-m', expiresAt: null, scopes: ['ads_read'], metaUser: { id: 'mm' }, accounts: MOCK_ACCOUNTS },
    KEYS,
  );
  const [a] = await importAccounts(ctx, { connectionId, metaAccountIds: ['act_100000001'] });
  const enqueue = recordingEnqueue();
  await startBackfill(ctx, a!.adAccountId, { enqueue, clock: { now } });
  await syncRange(ctx, enqueue.calls[0]!.payload as never, { meta: new MockMetaRead(now), keys: KEYS.keys });
  return { ctx, id: a!.adAccountId, ws: workspace.id };
}

const range = { from: '2026-10-16', to: '2026-10-22' };

describe('chỉ số báo cáo', () => {
  it('KPI tài khoản = tổng insight; CPA/ROAS chia thập phân', async () => {
    const { ctx, id } = await synced();
    const k = (await accountKpis(ctx, [id], range)).get(id)!;
    const [raw] = await db.execute<{ spend: string; results: string }>(
      sql`select sum(spend)::text as spend, sum(results)::text as results from analytics.insights_daily where ad_account_id = ${id}`,
    );
    expect(k.spend).toBe(raw!.spend);
    expect(k.results).toBe(Number(raw!.results));
    expect(Number(k.cpa)).toBeCloseTo(Number(raw!.spend) / Number(raw!.results), 3);
    expect(k.roas).not.toBeNull();
    expect(k.ctr).toBeGreaterThan(0);
    expect(k.resultTypes).toContain('lead');
  });

  it('chuỗi theo ngày đủ mọi ngày, ngày thiếu = 0', async () => {
    const { ctx, id } = await synced();
    const s = await dailySeries(ctx, [id], { from: '2026-10-14', to: '2026-10-22' });
    expect(s.map((d) => d.date)).toEqual([
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
      '2026-10-18',
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
    ]);
    expect(s[0]!.spend).toBe('0');
    expect(Number(s.at(-1)!.spend)).toBeGreaterThan(0);
  });

  it('bảng campaign: tổng campaign = tổng tài khoản; sắp theo chi tiêu', async () => {
    const { ctx, id } = await synced();
    const rows = await entityTable(ctx, [id], 'campaign', range);
    expect(rows).toHaveLength(3);
    const total = rows.reduce((t, r) => t + Number(r.kpis.spend), 0);
    expect(total).toBeCloseTo(Number((await accountKpis(ctx, [id], range)).get(id)!.spend), 2);
    expect(Number(rows[0]!.kpis.spend)).toBeGreaterThanOrEqual(Number(rows[1]!.kpis.spend));
    expect((await entityTable(ctx, [id], 'ad', range)).length).toBeGreaterThan(10);
  });

  it('buyer không có Client → không thấy gì; tài khoản workspace khác bị bỏ qua', async () => {
    const { ctx, id, ws } = await synced();
    const buyer = await seedMember(db, ws, 'buyer');
    const bctx = { ...ctx, actor: (await resolveActor(db, ws, buyer.id))! };
    expect([...(await accountKpis(bctx, [id], range)).keys()]).toEqual([]);
    expect(await entityTable(bctx, [id], 'campaign', range)).toEqual([]);
    const other = await seedWorkspace(db);
    const octx = {
      db,
      workspaceId: other.workspace.id,
      actor: (await resolveActor(db, other.workspace.id, other.owner.id))!,
    };
    expect(await dailySeries(octx, [id], range)).toEqual([]);
  });

  it('không có dữ liệu → KPI 0, chỉ số chia = null', () => {
    expect(toKpis(undefined)).toMatchObject({ spend: '0', ctr: null, cpa: null, roas: null, cpm: null });
  });
});
