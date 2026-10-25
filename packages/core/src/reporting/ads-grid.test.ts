import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeTestDb, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { recordingEnqueue } from '@adxlens/jobs';
import { MOCK_ACCOUNTS, MockMetaRead } from '@adxlens/meta-client/mock';
import { importAccounts, keysFromEnv, saveConnection } from '@adxlens/core/connections';
import { startBackfill, syncRange } from '@adxlens/core/ingestion';
import { resolveActor } from '@adxlens/core/tenancy';
import { adFormat, adsGrid, adsManagerData, cardChange } from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());
const KEYS = keysFromEnv({ TOKEN_ENC_KEY_V1: Buffer.alloc(32, 8).toString('base64') });
const now = () => new Date('2026-10-23T03:00:00Z');

async function setup(name = 'A') {
  const { workspace, owner } = await seedWorkspace(db, name);
  const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
  const { connectionId } = await saveConnection(
    ctx,
    {
      token: 'mock-read-ag',
      expiresAt: null,
      scopes: ['ads_read'],
      metaUser: { id: `ag${name}` },
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

describe('lưới quảng cáo Workspace (W6)', () => {
  it('mỗi quảng cáo một thẻ: loại theo creative, mục tiêu chiến dịch, chỉ số = tổng insight, so kỳ trước', async () => {
    const { ctx, id } = await setup();
    const cur = { from: '2026-10-16', to: '2026-10-22' };
    const prev = { from: '2026-10-09', to: '2026-10-15' };
    const cards = await adsGrid(ctx, [id], cur, prev);
    expect(cards.length).toBeGreaterThan(3);
    expect(new Set(cards.map((c) => c.format))).toEqual(new Set(['video', 'image']));
    expect(cards.every((c) => c.objective?.startsWith('OUTCOME_'))).toBe(true);
    const top = cards[0]!;
    expect(Number(top.metrics.spend)).toBeGreaterThanOrEqual(Number(cards[1]!.metrics.spend));
    const [raw] = await db.execute<{ spend: string }>(sql`
      select sum(spend)::text as spend from analytics.insights_daily
      where ad_account_id = ${id} and meta_id = ${top.metaId} and date between '2026-10-16' and '2026-10-22'`);
    expect(Number(top.metrics.spend)).toBe(Number(raw!.spend));
    expect(top.prev).not.toBeNull();
    expect(typeof cardChange(top, 'spend')).toBe('number');
  });

  it('cách ly: tài khoản của workspace khác → rỗng', async () => {
    const a = await setup('A');
    const b = await setup('B');
    const r = { from: '2026-10-16', to: '2026-10-22' };
    expect(await adsGrid(b.ctx, [a.id], r, r)).toEqual([]);
  });

  it('Ads Manager (W7): đủ 3 cấp, dòng = tổng insight theo cấp, chuỗi theo ngày, dòng tổng = tổng tài khoản', async () => {
    const { ctx, id } = await setup();
    const cur = { from: '2026-10-16', to: '2026-10-22' };
    const prev = { from: '2026-10-09', to: '2026-10-15' };
    const d = await adsManagerData(ctx, [id], cur, prev);
    expect(d.dates).toHaveLength(7);
    expect(new Set(d.rows.map((r) => r.level))).toEqual(new Set(['campaign', 'adset', 'ad']));
    const camp = d.rows
      .filter((r) => r.level === 'campaign')
      .sort((a, b) => Number(b.metrics.spend) - Number(a.metrics.spend))[0]!;
    const [raw] = await db.execute<{ spend: string; total: string }>(sql`
      select (select sum(spend) from analytics.insights_daily where ad_account_id = ${id} and campaign_id = ${camp.metaId}
        and date between '2026-10-16' and '2026-10-22')::text as spend,
        (select sum(spend) from analytics.insights_daily where ad_account_id = ${id}
        and date between '2026-10-16' and '2026-10-22')::text as total`);
    expect(Number(camp.metrics.spend)).toBeCloseTo(Number(raw!.spend), 4);
    expect(Number(d.total.spend)).toBeCloseTo(Number(raw!.total), 4);
    expect(camp.series).toHaveLength(7);
    expect(camp.prev).not.toBeNull();
    const adsets = d.rows.filter((r) => r.level === 'adset' && r.parentMetaId === camp.metaId);
    expect(adsets.length).toBeGreaterThan(0);
  });

  it('object_type → loại hiển thị', () => {
    expect(adFormat('VIDEO')).toBe('video');
    expect(adFormat('PHOTO')).toBe('image');
    expect(adFormat('SHARE', true)).toBe('video');
    expect(adFormat('MULTI_SHARE')).toBe('carousel');
    expect(adFormat('STATUS')).toBe('text');
    expect(adFormat(null)).toBe('other');
  });
});
