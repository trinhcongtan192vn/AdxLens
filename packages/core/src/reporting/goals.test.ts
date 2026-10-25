import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeTestDb, seedMember, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { recordingEnqueue } from '@adxlens/jobs';
import { MOCK_ACCOUNTS, MockMetaRead } from '@adxlens/meta-client/mock';
import {
  assignAdAccount,
  importAccounts,
  keysFromEnv,
  listAssets,
  refreshAvailableAccounts,
  saveConnection,
} from '@adxlens/core/connections';
import { startBackfill, syncRange } from '@adxlens/core/ingestion';
import { resolveActor } from '@adxlens/core/tenancy';
import {
  clientGoalStatus,
  computeMetrics,
  getClientGoal,
  goalSuggestions,
  listClientGoals,
  saveClientGoal,
  vsTarget,
} from './index';

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
      token: 'mock-read-g',
      expiresAt: null,
      scopes: ['ads_read'],
      metaUser: { id: `g${name}` },
      accounts: MOCK_ACCOUNTS,
    },
    KEYS,
  );
  await refreshAvailableAccounts(ctx, connectionId, { meta: new MockMetaRead(now), keys: KEYS.keys, clock: { now } });
  const [a] = await importAccounts(ctx, { connectionId, metaAccountIds: ['act_100000001'] });
  const enqueue = recordingEnqueue();
  await startBackfill(ctx, a!.adAccountId, { enqueue, clock: { now } });
  await syncRange(ctx, enqueue.calls[0]!.payload as never, { meta: new MockMetaRead(now), keys: KEYS.keys });
  const r = await assignAdAccount(ctx, a!.adAccountId, { createClientName: `Khách ${name}` });
  return { ctx, clientId: r.clientId!, accountId: a!.adAccountId, workspaceId: workspace.id };
}

describe('mục tiêu theo Client (ADR-0017)', () => {
  it('gợi ý = số thực tế hôm qua / 7 ngày, tính từ insight (không LLM)', async () => {
    const { ctx, clientId, accountId } = await setup();
    const s = await goalSuggestions(ctx, clientId, { now });
    expect(s).toMatchObject({ currency: 'VND', mixedCurrency: false, accounts: 1 });
    const [raw] = await db.execute<{ spend: string; results: string }>(sql`
      select sum(spend)::text as spend, sum(results)::text as results from analytics.insights_daily
      where ad_account_id = ${accountId} and date between '2026-10-16' and '2026-10-22'`);
    expect(s.last7.spend).toBe(raw!.spend);
    expect(Number(s.last7.cpa)).toBeCloseTo(Number(raw!.spend) / Number(raw!.results), 2);
    expect(Number(s.last7.purchases)).toBeGreaterThan(0);
    expect(Number(s.last7.leads)).toBeGreaterThan(0);
    expect(Number(s.last7.add_to_cart)).toBeGreaterThan(Number(s.last7.purchases));
    expect(s.yesterday.spend).not.toBe('0');
  });

  it('lưu từng bước, đánh dấu onboarding xong; chỉ số tiền gắn tiền tệ', async () => {
    const { ctx, clientId } = await setup();
    await saveClientGoal(ctx, clientId, { primaryMetric: 'cpa', primaryTarget: '150000' });
    await saveClientGoal(ctx, clientId, { secondaryMetrics: ['ctr', 'cpm'] });
    const pixel = (await listAssets(ctx, 'pixel'))[0]!.metaId;
    const g = await saveClientGoal(ctx, clientId, {
      industry: 'hospitality',
      subIndustry: 'homestay_glamping',
      defaultPageId: 'page1',
      defaultInstagramId: 'ig1',
      defaultPixelId: pixel,
      complete: true,
    });
    expect(g).toMatchObject({
      primaryMetric: 'cpa',
      primaryTarget: '150000.0000',
      currency: 'VND',
      secondaryMetrics: ['ctr', 'cpm'],
      industry: 'hospitality',
      defaultPageId: 'page1',
    });
    expect(g.onboardedAt).toBeInstanceOf(Date);
    expect((await listClientGoals(ctx)).get(clientId)?.primaryMetric).toBe('cpa');
  });

  it('từ chối: chỉ số ngoài danh mục, mục tiêu âm, >2 chỉ số phụ, trùng chỉ số chính, ngành lạ, tài sản không thuộc workspace', async () => {
    const { ctx, clientId } = await setup();
    const bad = [
      { primaryMetric: 'spend' as never },
      { primaryMetric: 'cpa' as const, primaryTarget: '-1' },
      { secondaryMetrics: ['ctr', 'cpm', 'cpc'] as never },
      { primaryMetric: 'cpa' as const, secondaryMetrics: ['cpa'] as never },
      { industry: 'ecommerce', subIndustry: 'hotel_resort' },
      { defaultPageId: 'page-of-someone-else' },
    ];
    for (const input of bad) {
      await expect(saveClientGoal(ctx, clientId, input)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    }
  });

  it('cách ly: workspace B không đọc / ghi được mục tiêu Client của A; buyer không sửa được', async () => {
    const a = await setup('A');
    const b = await setup('B');
    await saveClientGoal(a.ctx, a.clientId, { primaryMetric: 'roas', primaryTarget: '3' });
    await expect(getClientGoal(b.ctx, a.clientId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(saveClientGoal(b.ctx, a.clientId, { primaryMetric: 'cpa' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect((await listClientGoals(b.ctx)).size).toBe(0);
    const buyer = await seedMember(db, a.workspaceId, 'buyer');
    const bctx = { db, workspaceId: a.workspaceId, actor: (await resolveActor(db, a.workspaceId, buyer.id))! };
    await expect(saveClientGoal(bctx, a.clientId, { primaryMetric: 'cpa' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('trạng thái mục tiêu của Client: 7 ngày qua so với mục tiêu (danh sách Client)', async () => {
    const { ctx, clientId } = await setup();
    expect((await clientGoalStatus(ctx, { now })).size).toBe(0);
    const s = await goalSuggestions(ctx, clientId, { now });
    await saveClientGoal(ctx, clientId, { primaryMetric: 'cpa', primaryTarget: '100000' });
    const st = (await clientGoalStatus(ctx, { now })).get(clientId)!;
    expect(st.actual).toBe(s.last7.cpa);
    expect(st.vsTargetPct).toBe(vsTarget('cpa', s.last7.cpa, '100000'));
  });

  it('so với mục tiêu theo hướng tốt của chỉ số', () => {
    expect(vsTarget('cpa', '90', '100')).toBe(10);
    expect(vsTarget('cpa', '120', '100')).toBe(-20);
    expect(vsTarget('roas', '4', '3')).toBeCloseTo(33.3);
    expect(vsTarget('roas', null, '3')).toBeNull();
  });

  it('danh mục chỉ số: chia thập phân, mẫu số 0 → null, không đếm trùng', () => {
    const m = computeMetrics({
      spend: '1000',
      impressions: '2000',
      reach: '1000',
      link_clicks: '40',
      results: '0',
      purchases: '4',
      leads: '0',
      add_to_cart: '10',
      conversion_value: '5000',
    });
    expect(m).toMatchObject({
      ctr: '2.00',
      cpc: '25.0000',
      cpm: '500.00',
      cpa: null,
      cost_per_purchase: '250.0000',
      roas: '5.00',
      frequency: '2.00',
      cpl: null,
      cost_per_add_to_cart: '100.0000',
    });
  });
});
