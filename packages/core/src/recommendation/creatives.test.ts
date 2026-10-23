import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@adxlens/db';
import {
  closeTestDb,
  seedAdAccount,
  seedClient,
  seedConnection,
  seedMember,
  seedWorkspace,
  testDb,
  truncateAll,
} from '@adxlens/db/testing';
import { RULES } from '@adxlens/core/insight';
import { addDays } from '@adxlens/core/shared';
import { resolveActor } from '@adxlens/core/tenancy';
import { compareCreatives, creativeLibrary, FATIGUE_CONFIG, fatigueForecast } from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());

const TO = '2026-10-22';
const range = { from: addDays(TO, -13), to: TO };

type DayFn = (i: number) => {
  spend: number;
  impressions: number;
  linkClicks: number;
  results: number;
  frequency?: number;
};

async function setup() {
  const { workspace, owner } = await seedWorkspace(db);
  const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
  const conn = await seedConnection(db, workspace.id, owner.id);
  const client = await seedClient(db, workspace.id);
  const acc = await seedAdAccount(db, workspace.id, conn.id, { clientId: client.id, confirmed: true });
  /** Một creative dùng ở `ads` ad, mỗi ad nhận số liệu `day(i)` cho 14 ngày (i = 0 là ngày cũ nhất). */
  const creative = async (id: string, day: DayFn, ads = 1, resultType = 'lead') => {
    await db.insert(schema.entities).values({
      workspaceId: workspace.id,
      adAccountId: acc.id,
      entityType: 'creative',
      metaId: id,
      name: `Creative ${id}`,
      attrs: { thumbnail_url: `https://img.test/${id}.jpg`, format: 'VIDEO' },
    });
    for (let a = 0; a < ads; a++) {
      const adId = `${id}-ad${a}`;
      await db.insert(schema.entities).values({
        workspaceId: workspace.id,
        adAccountId: acc.id,
        entityType: 'ad',
        metaId: adId,
        parentMetaId: 'adset1',
        name: `Ad ${adId}`,
        attrs: { creative_id: id },
      });
      const rows = Array.from({ length: 14 }, (_, i) => {
        const d = day(i);
        return {
          workspaceId: workspace.id,
          adAccountId: acc.id,
          entityType: 'ad' as const,
          metaId: adId,
          adsetId: 'adset1',
          campaignId: 'camp1',
          date: addDays(TO, i - 13),
          spend: String(d.spend),
          impressions: d.impressions,
          reach: Math.round(d.impressions / (d.frequency ?? 1.5)),
          frequency: String(d.frequency ?? 1.5),
          clicks: d.linkClicks,
          linkClicks: d.linkClicks,
          results: d.results,
          resultType,
          attributionWindow: '7d_click_1d_view',
        };
      });
      await db.insert(schema.insightsDaily).values(rows);
    }
  };
  return { ctx, acc, creative, workspaceId: workspace.id, clientId: client.id };
}

// Ổn định: 100.000đ/ngày, 2.000 hiển thị, 40 click, `r` kết quả/ngày.
const steady =
  (r: number, spend = 100_000): DayFn =>
  () => ({ spend, impressions: 2000, linkClicks: 40, results: r });

describe('creative library (P103, P1-01/03)', () => {
  it('"Đang mệt" dùng đúng ngưỡng của rule creative_fatigue', () => {
    expect(FATIGUE_CONFIG).toBe(RULES.find((r) => r.id === 'creative_fatigue')!.defaults);
  });

  it('gom ad theo creative gốc: 2 ad cùng creative → một dòng, chỉ số cộng dồn', async () => {
    const { ctx, acc, creative } = await setup();
    await creative('c1', steady(2), 2);
    const rows = await creativeLibrary(ctx, acc.id, range);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      creativeId: 'c1',
      adCount: 2,
      thumbnailUrl: 'https://img.test/c1.jpg',
      format: 'VIDEO',
      firstDate: range.from,
      lastDate: TO,
    });
    expect(rows[0]!.metrics.spend).toBe('2800000.0000');
    expect(rows[0]!.metrics.results).toBe(56);
    expect(rows[0]!.metrics.cpa).toBe('50000.0000');
  });

  it('phân loại Winner / Cần theo dõi / Thua theo CPA so trung vị cùng loại kết quả', async () => {
    const { ctx, acc, creative } = await setup();
    await creative('win', steady(4)); // CPA 25.000
    await creative('mid1', steady(2)); // 50.000
    await creative('mid2', steady(2)); // 50.000
    await creative('lose', steady(1)); // 100.000 = 2× trung vị
    const rows = await creativeLibrary(ctx, acc.id, range);
    const cls = Object.fromEntries(rows.map((r) => [r.creativeId, r.class]));
    expect(cls).toEqual({ win: 'winner', mid1: 'watch', mid2: 'watch', lose: 'loser' });
    expect(rows.find((r) => r.creativeId === 'win')!.reason).toEqual({ key: 'winner', params: { pct: 50 } });
  });

  it('không đủ dữ liệu thì không xếp: ít hiển thị → insufficient; ít creative cùng loại → watch', async () => {
    const { ctx, acc, creative } = await setup();
    await creative('tiny', () => ({ spend: 1000, impressions: 50, linkClicks: 1, results: 0 }));
    await creative('a', steady(4));
    await creative('b', steady(1));
    const rows = await creativeLibrary(ctx, acc.id, range);
    const by = Object.fromEntries(rows.map((r) => [r.creativeId, r]));
    expect(by.tiny!.class).toBe('insufficient');
    expect(by.a!.class).toBe('watch');
    expect(by.a!.reason.key).toBe('noPeers');
    expect(by.b!.class).toBe('watch');
  });

  it('"Đang mệt": tần suất tăng ≥ 20% và CTR giảm ≥ 25% tuần này so tuần trước', async () => {
    const { ctx, acc, creative } = await setup();
    await creative('tired', (i) =>
      i < 7
        ? { spend: 100_000, impressions: 3000, linkClicks: 60, results: 2, frequency: 2.0 }
        : { spend: 100_000, impressions: 3000, linkClicks: 30, results: 1, frequency: 3.0 },
    );
    const [row] = await creativeLibrary(ctx, acc.id, range);
    expect(row!.class).toBe('fatigued');
    expect(row!.reason).toEqual({ key: 'fatigued', params: { ctrDrop: 50, freq: 3 } });
    expect(row!.forecast).toBeNull();
  });

  it('manager/buyer không được Client thì không xem được tài khoản', async () => {
    const { acc, workspaceId } = await setup();
    const buyer = await seedMember(db, workspaceId, 'buyer');
    const bctx = { db, workspaceId, actor: (await resolveActor(db, workspaceId, buyer.id))! };
    await expect(creativeLibrary(bctx, acc.id, range)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('cách ly: tài khoản của workspace khác → NOT_FOUND', async () => {
    const a = await setup();
    const b = await setup();
    await b.creative('secret', steady(2));
    await expect(creativeLibrary(a.ctx, b.acc.id, range)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('dự báo mệt (P1-07)', () => {
  const series = (ctr: (i: number) => number) =>
    Array.from({ length: 14 }, (_, i) => ({ impressions: 1000, linkClicks: Math.round(ctr(i) * 1000) }));

  it('CTR giảm đều → dự báo số ngày tới ngưỡng mệt (≤ 7 ngày)', () => {
    // 2,0% giảm 0,05 điểm/ngày: TB 7 ngày đầu 1,85%, ngưỡng 1,39%, ngày cuối 1,35% → đã chạm ngưỡng, không còn là dự báo
    expect(fatigueForecast(series((i) => 0.02 - i * 0.0005))).toBeNull();
    // 2,0% giảm 0,03 điểm/ngày: TB đầu 1,91%, ngưỡng ≈ 1,43%, ngày cuối 1,61% → ~6 ngày
    const f = fatigueForecast(series((i) => 0.02 - i * 0.0003));
    expect(f).not.toBeNull();
    expect(f!.days).toBeGreaterThan(0);
    expect(f!.days).toBeLessThanOrEqual(7);
  });

  it('CTR ổn định / tăng / thiếu ngày → không dự báo', () => {
    expect(fatigueForecast(series(() => 0.02))).toBeNull();
    expect(fatigueForecast(series((i) => 0.01 + i * 0.001))).toBeNull();
    const sparse = series((i) => 0.02 - i * 0.0003).map((d, i) => (i % 2 ? { impressions: 0, linkClicks: 0 } : d));
    expect(fatigueForecast(sparse)).toBeNull();
  });
});

describe('so sánh creative (P104, P1-02)', () => {
  it('2–4 creative, chỉ số + chuỗi theo ngày đủ khoảng', async () => {
    const { ctx, acc, creative } = await setup();
    await creative('x', steady(2));
    await creative('y', steady(4));
    const r = await compareCreatives(ctx, acc.id, ['x', 'y'], range);
    expect(r.rows.map((x) => x.creativeId)).toEqual(['x', 'y']);
    expect(r.series[0]!.days).toHaveLength(14);
    expect(r.series[1]!.days[0]).toMatchObject({ spend: '100000.0000', cpa: '25000.0000' });
    await expect(compareCreatives(ctx, acc.id, ['x'], range)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});
