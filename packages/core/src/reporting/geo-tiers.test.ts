import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeTestDb, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { recordingEnqueue } from '@adxlens/jobs';
import { MOCK_ACCOUNTS, MockMetaRead } from '@adxlens/meta-client/mock';
import { importAccounts, keysFromEnv, saveConnection } from '@adxlens/core/connections';
import { startBackfill, syncRange } from '@adxlens/core/ingestion';
import { resolveActor } from '@adxlens/core/tenancy';
import { countryAnalysis, tierOf, trendingRegions, withTrend } from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());
const KEYS = keysFromEnv({ TOKEN_ENC_KEY_V1: Buffer.alloc(32, 8).toString('base64') });
const now = () => new Date('2026-10-23T03:00:00Z');
const cur = { from: '2026-10-16', to: '2026-10-22' };
const prev = { from: '2026-10-09', to: '2026-10-15' };

const row = (key: string, spend: string, results = 1) => ({ key, spend, results, cpa: null, ctr: null, share: 0 });

describe('Địa lý: Tier quốc gia + xu hướng (Madgicx Geo & Demo)', () => {
  it('Tier theo mã nước; nước lạ → Tier 4', () => {
    expect([tierOf('us'), tierOf('KR'), tierOf('VN'), tierOf('KH'), tierOf('unknown')]).toEqual([1, 2, 3, 4, 4]);
  });

  it('xu hướng: ±20% so kỳ trước, mới khi kỳ trước 0; wasted khi có chi mà 0 kết quả', () => {
    const r = withTrend(
      [row('A', '120'), row('B', '79'), row('C', '110'), row('D', '50', 0)],
      [row('A', '100'), row('B', '100'), row('C', '100')],
    );
    expect(r.map((x) => [x.key, x.trend, x.spendChangePct, x.wasted])).toEqual([
      ['A', 'rising', 20, false],
      ['B', 'falling', -21, false],
      ['C', null, 10, false],
      ['D', 'new', null, true],
    ]);
  });

  it('đồng bộ lưu breakdown quốc gia; tổng Tier = 100% chi tiêu; VN ở Tier 3', async () => {
    const { workspace, owner } = await seedWorkspace(db);
    const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
    const { connectionId } = await saveConnection(
      ctx,
      {
        token: 'mock-read-geo',
        expiresAt: null,
        scopes: ['ads_read'],
        metaUser: { id: 'geo' },
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
    const r = await countryAnalysis(ctx, [a!.adAccountId], cur, prev);
    expect(r.countries.map((c) => c.key)).toEqual(expect.arrayContaining(['VN', 'US', 'SG', 'TH', 'KH']));
    expect(r.countries.find((c) => c.key === 'VN')!.tier).toBe(3);
    const share = r.tiers.reduce((s, t) => s + t.share, 0);
    expect(share).toBeGreaterThan(99.5);
    expect(share).toBeLessThan(100.5);
    expect(r.tiers.map((t) => t.tier)).toEqual([1, 3, 4]);
    expect((await trendingRegions(ctx, [a!.adAccountId], cur, prev)).length).toBeGreaterThan(0);
  });
});
