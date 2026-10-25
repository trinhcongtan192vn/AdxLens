import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import { closeTestDb, seedAdAccount, seedConnection, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { addDays } from '@adxlens/core/shared';
import { detectAnomalies, runAnomalyCheck } from './index';

const Y = '2026-10-22';
/** 7 ngày nền 1.000.000đ / 20 kết quả mỗi ngày + hôm qua. */
const series = (yesterday: { spend: number; results: number }, baseSpend = 1_000_000, baseResults = 20) => [
  ...Array.from({ length: 7 }, (_, i) => ({ date: addDays(Y, i - 7), spend: baseSpend, results: baseResults })),
  { date: Y, ...yesterday },
];

describe('bất thường hằng ngày (A5) — phát hiện', () => {
  it('chi tiêu tăng gấp đôi, về 0, CPA tăng ≥ 50%, không kết quả dù vẫn chi', () => {
    expect(detectAnomalies(series({ spend: 2_500_000, results: 50 }), Y, 'VND')).toEqual([
      { kind: 'spend_spike', pct: 150 },
    ]);
    expect(detectAnomalies(series({ spend: 0, results: 0 }), Y, 'VND')).toEqual([{ kind: 'spend_stop', pct: null }]);
    expect(detectAnomalies(series({ spend: 1_000_000, results: 10 }), Y, 'VND')).toEqual([
      { kind: 'cpa_spike', pct: 100 },
    ]);
    expect(detectAnomalies(series({ spend: 900_000, results: 0 }), Y, 'VND')).toEqual([
      { kind: 'results_drop', pct: null },
    ]);
  });

  it('bình thường hoặc không đủ dữ liệu nền → không báo', () => {
    expect(detectAnomalies(series({ spend: 1_100_000, results: 21 }), Y, 'VND')).toEqual([]);
    // Nền chỉ 4 ngày có chi tiêu.
    const sparse = series({ spend: 5_000_000, results: 10 }).map((d, i) => (i < 3 ? { ...d, spend: 0 } : d));
    expect(detectAnomalies(sparse, Y, 'VND')).toEqual([]);
    // Tăng gấp đôi nhưng chênh tuyệt đối nhỏ (tài khoản chi ít).
    expect(detectAnomalies(series({ spend: 300_000, results: 2 }, 100_000, 1), Y, 'VND')).toEqual([]);
    // CPA tăng nhưng hôm qua < 3 kết quả → chưa đủ chắc.
    expect(detectAnomalies(series({ spend: 200_000, results: 2 }), Y, 'VND').map((a) => a.kind)).not.toContain(
      'cpa_spike',
    );
  });
});

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());

describe('bất thường hằng ngày (A5) — thông báo', () => {
  it('gửi thông báo theo loại, không gửi lặp cùng ngày', async () => {
    const { workspace, owner } = await seedWorkspace(db);
    const conn = await seedConnection(db, workspace.id, owner.id);
    const acc = await seedAdAccount(db, workspace.id, conn.id, { name: 'Cà phê Nhà Rang' });
    await db.insert(schema.insightsDaily).values(
      series({ spend: 2_500_000, results: 50 }).map((d) => ({
        workspaceId: workspace.id,
        adAccountId: acc.id,
        entityType: 'ad' as const,
        metaId: 'ad1',
        adsetId: 'as1',
        date: d.date,
        spend: String(d.spend),
        impressions: 10_000,
        linkClicks: 100,
        clicks: 100,
        results: d.results,
        attributionWindow: '7d_click_1d_view',
      })),
    );
    const clock = { now: () => new Date('2026-10-23T03:00:00Z') }; // 23/10 giờ VN → hôm qua 22/10
    const ctx = { db, workspaceId: workspace.id };
    expect((await runAnomalyCheck(ctx, acc.id, { clock })).anomalies.map((a) => a.kind)).toEqual(['spend_spike']);
    await runAnomalyCheck(ctx, acc.id, { clock });
    const notes = await db.select().from(schema.notifications).where(eq(schema.notifications.kind, 'anomaly'));
    expect(notes).toHaveLength(1);
    expect(notes[0]!.params).toMatchObject({
      account: 'Cà phê Nhà Rang',
      anomaly: 'spend_spike',
      pct: 150,
      date: '22/10',
    });
  });
});
