import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeTestDb, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { recordingEnqueue } from '@adxlens/jobs';
import { MOCK_ACCOUNTS, MockMetaRead } from '@adxlens/meta-client/mock';
import { importAccounts, keysFromEnv, saveConnection } from '@adxlens/core/connections';
import { startBackfill, syncRange } from '@adxlens/core/ingestion';
import { resolveActor } from '@adxlens/core/tenancy';
import { classifyFatigue, entityNames, funnelAnalysis, geographyAnalysis, scaleAnalysis } from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());
const KEYS = keysFromEnv({ TOKEN_ENC_KEY_V1: Buffer.alloc(32, 8).toString('base64') });
const now = () => new Date('2026-10-23T03:00:00Z');
const cur = { from: '2026-10-16', to: '2026-10-22' };
const prev = { from: '2026-10-09', to: '2026-10-15' };

async function setup(name = 'A') {
  const { workspace, owner } = await seedWorkspace(db, name);
  const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
  const { connectionId } = await saveConnection(
    ctx,
    {
      token: 'mock-read-an',
      expiresAt: null,
      scopes: ['ads_read'],
      metaUser: { id: `an${name}` },
      accounts: MOCK_ACCOUNTS,
    },
    KEYS,
  );
  const [a] = await importAccounts(ctx, { connectionId, metaAccountIds: ['act_100000001'] });
  const enqueue = recordingEnqueue();
  await startBackfill(ctx, a!.adAccountId, { enqueue, clock: { now } });
  for (const c of enqueue.calls.slice(0, 2)) {
    await syncRange(ctx, c.payload as never, { meta: new MockMetaRead(now), keys: KEYS.keys });
  }
  return { ctx, id: a!.adAccountId };
}

describe('phân tích Workspace (W8)', () => {
  it('phễu: hiển thị → click → thêm giỏ → chuyển đổi = tổng insight; tỷ lệ giữa các bước', async () => {
    const { ctx, id } = await setup();
    const names = await entityNames(ctx, [id], 'campaign');
    const f = await funnelAnalysis(ctx, [id], cur, 'campaign', names);
    const [raw] = await db.execute<{ impressions: string; link_clicks: string }>(sql`
      select sum(impressions)::text as impressions, sum(link_clicks)::text as link_clicks from analytics.insights_daily
      where ad_account_id = ${id} and date between '2026-10-16' and '2026-10-22'`);
    expect(f.total.stages.map((s) => s.key)).toEqual(['impressions', 'link_clicks', 'add_to_cart', 'conversions']);
    expect(f.total.stages[0]!.value).toBe(Number(raw!.impressions));
    expect(f.total.stages[1]!.value).toBe(Number(raw!.link_clicks));
    expect(f.total.rates[0]).toBeCloseTo((Number(raw!.link_clicks) / Number(raw!.impressions)) * 100, 1);
    expect(f.total.conversionLabel).toBe('purchases');
    expect(f.rows.length).toBe(3);
    expect(f.rows.every((r) => r.name)).toBe(true);
    // Chiến dịch traffic không có thêm giỏ → phễu 3 bước.
    expect(f.rows.some((r) => r.funnel.stages.length === 3)).toBe(true);
  });

  it('4 góc "quảng cáo có mệt không": theo trung vị tần suất và CPC', () => {
    const r = classifyFatigue([
      { adAccountId: 'a', metaId: '1', name: 'fresh', frequency: 1, cpc: 1, spend: '10' },
      { adAccountId: 'a', metaId: '2', name: 'burn', frequency: 5, cpc: 5, spend: '10' },
      { adAccountId: 'a', metaId: '3', name: 'early', frequency: 1, cpc: 5, spend: '10' },
      { adAccountId: 'a', metaId: '4', name: 'hold', frequency: 5, cpc: 1, spend: '10' },
    ]);
    expect(r.freqMid).toBe(3);
    expect(r.points.map((p) => p.quadrant)).toEqual(['fresh_cheap', 'burning_out', 'expensive_early', 'still_holding']);
  });

  it('địa lý: tỷ trọng cộng ~100%, đánh dấu khu vực chi mà không có kết quả', async () => {
    const { ctx, id } = await setup();
    const g = await geographyAnalysis(ctx, [id], cur);
    expect(g.rows.length).toBeGreaterThan(0);
    expect(g.rows.reduce((t, r) => t + r.share, 0)).toBeCloseTo(100, 0);
    for (const r of g.rows) expect(r.wasted).toBe(Number(r.spend) > 0 && r.results === 0);
  });

  it('mở rộng: điểm mệt mỏi cho quảng cáo có chi tiêu, format mix cộng ~100%, tuổi × giới tính, xu hướng 7 ngày', async () => {
    const { ctx, id } = await setup();
    const s = await scaleAnalysis(ctx, [id], cur, prev);
    expect(s.fatigue.points.length).toBeGreaterThan(3);
    expect(s.formatMix.map((f) => f.format).sort()).toEqual(['image', 'video']);
    expect(s.formatMix.reduce((t, f) => t + f.share, 0)).toBeCloseTo(100, 0);
    expect(s.ageGender.length).toBeGreaterThan(0);
    expect(s.trend).toHaveLength(7);
  });

  it('cách ly: tài khoản workspace khác → rỗng', async () => {
    const a = await setup('A');
    const b = await setup('B');
    expect((await geographyAnalysis(b.ctx, [a.id], cur)).rows).toEqual([]);
    expect((await entityNames(b.ctx, [a.id], 'campaign')).size).toBe(0);
    expect((await scaleAnalysis(b.ctx, [a.id], cur, prev)).fatigue.points).toEqual([]);
  });
});
