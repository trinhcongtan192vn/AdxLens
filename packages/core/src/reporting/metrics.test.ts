import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeTestDb, seedMember, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { recordingEnqueue } from '@adxlens/jobs';
import { MOCK_ACCOUNTS, MockMetaRead } from '@adxlens/meta-client/mock';
import { assignAdAccount, importAccounts, keysFromEnv, saveConnection } from '@adxlens/core/connections';
import { runAudit } from '@adxlens/core/insight';
import { startBackfill, syncRange } from '@adxlens/core/ingestion';
import { resolveActor } from '@adxlens/core/tenancy';
import { accountKpis, agencyOverview, dailySeries, entityTable, toKpis } from './index';

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

describe('tổng quan agency (O01, C01)', () => {
  it('theo Client: chi tiêu 7/30 ngày theo tiền tệ, health thấp nhất, số vấn đề cao; tài khoản chưa gán tách riêng', async () => {
    const { ctx, id } = await synced();
    await runAudit(ctx, id, { clock: { now } });
    const before = await agencyOverview(ctx, { now });
    expect(before.clients).toEqual([]);
    expect(before.unassigned.map((a) => a.id)).toEqual([id]);

    await assignAdAccount(ctx, id, { createClientName: 'Cà phê' });
    const { clients, unassigned } = await agencyOverview(ctx, { now });
    expect(unassigned).toEqual([]);
    const c = clients[0]!;
    expect(c.name).toBe('Cà phê');
    const k7 = (await accountKpis(ctx, [id], { from: '2026-10-16', to: '2026-10-22' })).get(id)!;
    expect(c.spend7).toEqual({ VND: k7.spend });
    // Mới đồng bộ 1 lô (7 ngày) → 30 ngày = 7 ngày, 7 ngày trước = 0.
    expect(c.spend30.VND).toBe(k7.spend);
    expect(Number(c.spendPrev7.VND)).toBe(0);
    expect(c.health).toBeLessThan(100);
    expect(c.highIssues).toBe(c.accounts[0]!.highIssues);
  });
});
