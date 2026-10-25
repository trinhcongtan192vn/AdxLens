import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@adxlens/db';
import { closeTestDb, seedAdAccount, seedConnection, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { resolveActor } from '@adxlens/core/tenancy';
import { breakdownTable, topAds } from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());

const range = { from: '2026-10-01', to: '2026-10-07' };

async function setup() {
  const { workspace, owner } = await seedWorkspace(db);
  const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
  const conn = await seedConnection(db, workspace.id, owner.id);
  const acc = await seedAdAccount(db, workspace.id, conn.id);
  return { ctx, acc, ws: workspace.id };
}

describe('báo cáo sâu (A4)', () => {
  it('bảng theo nhóm: xếp theo chi tiêu, tỷ trọng, CPA decimal; bỏ ngoài kỳ và nhóm khác', async () => {
    const { ctx, acc, ws } = await setup();
    const row = (key: string, date: string, spend: string, results: number, breakdown = 'age_gender' as const) => ({
      workspaceId: ws,
      adAccountId: acc.id,
      adsetId: 'as1',
      date,
      breakdown,
      key,
      spend,
      impressions: 1000,
      linkClicks: 20,
      results,
    });
    await db
      .insert(schema.insightsBreakdowns)
      .values([
        row('25-34|female', '2026-10-02', '600000', 30),
        row('25-34|female', '2026-10-03', '150000', 0),
        row('18-24|male', '2026-10-02', '250000', 0),
        row('35-44|male', '2026-09-20', '9000000', 10),
        row('instagram|story', '2026-10-02', '1000000', 5, 'placement' as never),
      ]);
    const rows = await breakdownTable(ctx, [acc.id], range, 'age_gender');
    expect(rows).toEqual([
      { key: '25-34|female', spend: '750000.0000', results: 30, cpa: '25000.00', ctr: 0.02, share: 75 },
      { key: '18-24|male', spend: '250000.0000', results: 0, cpa: null, ctr: 0.02, share: 25 },
    ]);
  });

  it('top quảng cáo theo chi tiêu kèm thumbnail creative (chỉ https); tài khoản workspace khác không đọc được', async () => {
    const { ctx, acc, ws } = await setup();
    await db.insert(schema.entities).values([
      {
        workspaceId: ws,
        adAccountId: acc.id,
        entityType: 'ad',
        metaId: 'ad1',
        name: 'Ad 1',
        attrs: { creative_id: 'cr1' },
      },
      {
        workspaceId: ws,
        adAccountId: acc.id,
        entityType: 'ad',
        metaId: 'ad2',
        name: 'Ad 2',
        attrs: { creative_id: 'cr2' },
      },
      {
        workspaceId: ws,
        adAccountId: acc.id,
        entityType: 'creative',
        metaId: 'cr1',
        name: null,
        attrs: { thumbnail_url: 'https://scontent.example/cr1.jpg' },
      },
      {
        workspaceId: ws,
        adAccountId: acc.id,
        entityType: 'creative',
        metaId: 'cr2',
        name: null,
        attrs: { thumbnail_url: 'javascript:alert(1)' },
      },
    ]);
    const day = (metaId: string, spend: string, results: number) => ({
      workspaceId: ws,
      adAccountId: acc.id,
      entityType: 'ad' as const,
      metaId,
      adsetId: 'as1',
      date: '2026-10-02',
      spend,
      impressions: 2000,
      linkClicks: 40,
      clicks: 40,
      results,
      attributionWindow: '7d_click_1d_view',
    });
    await db.insert(schema.insightsDaily).values([day('ad1', '300000', 10), day('ad2', '900000', 0)]);
    const ads = await topAds(ctx, [acc.id], range);
    expect(ads.map((a) => [a.metaId, a.name, a.thumbnailUrl, a.cpa])).toEqual([
      ['ad2', 'Ad 2', null, null],
      ['ad1', 'Ad 1', 'https://scontent.example/cr1.jpg', '30000.00'],
    ]);

    const other = await setup();
    expect(await topAds(other.ctx, [acc.id], range)).toEqual([]);
    expect(await breakdownTable(other.ctx, [acc.id], range, 'age_gender')).toEqual([]);
  });
});
