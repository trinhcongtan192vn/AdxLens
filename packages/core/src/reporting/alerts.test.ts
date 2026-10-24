import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeTestDb, seedMember, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { recordingEnqueue } from '@adxlens/jobs';
import { MOCK_ACCOUNTS, MockMetaRead } from '@adxlens/meta-client/mock';
import { importAccounts, keysFromEnv, refreshAvailableAccounts, saveConnection } from '@adxlens/core/connections';
import { startBackfill, syncRange } from '@adxlens/core/ingestion';
import { resolveActor } from '@adxlens/core/tenancy';
import {
  alertSuggestions,
  createAlert,
  defaultHomeMetrics,
  deleteAlert,
  healthLabel,
  listAlerts,
  runCustomAlerts,
  setAlertEnabled,
  workspaceHome,
} from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());
const KEYS = keysFromEnv({ TOKEN_ENC_KEY_V1: Buffer.alloc(32, 8).toString('base64') });
const now = () => new Date('2026-10-23T03:00:00Z');
const clock = { now };

async function setup(name = 'A', full = false) {
  const { workspace, owner } = await seedWorkspace(db, name);
  const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
  const { connectionId } = await saveConnection(
    ctx,
    {
      token: 'mock-read-al',
      expiresAt: null,
      scopes: ['ads_read'],
      metaUser: { id: `al${name}` },
      accounts: MOCK_ACCOUNTS,
    },
    KEYS,
  );
  await refreshAvailableAccounts(ctx, connectionId, { meta: new MockMetaRead(now), keys: KEYS.keys, clock });
  const [a] = await importAccounts(ctx, { connectionId, metaAccountIds: ['act_100000001'] });
  const enqueue = recordingEnqueue();
  await startBackfill(ctx, a!.adAccountId, { enqueue, clock });
  const batches = full ? enqueue.calls : enqueue.calls.slice(0, 1);
  for (const c of batches) {
    await syncRange(ctx, c.payload as never, { meta: new MockMetaRead(now), keys: KEYS.keys });
  }
  return { ctx, id: a!.adAccountId, workspaceId: workspace.id, owner };
}

describe('cảnh báo tự đặt (ADR-0018)', () => {
  it('tạo / bật tắt / xóa; kiểm chỉ số, ngưỡng; buyer không đặt "mọi tài khoản"', async () => {
    const { ctx, id, workspaceId } = await setup();
    const a = await createAlert(ctx, {
      adAccountId: id,
      metric: 'cpm',
      condition: 'above',
      threshold: '50000',
      window: '1d',
    });
    expect(a).toMatchObject({ currency: 'VND', enabled: true });
    await setAlertEnabled(ctx, a.id, false);
    expect((await listAlerts(ctx))[0]!.enabled).toBe(false);
    await expect(
      createAlert(ctx, {
        adAccountId: id,
        metric: 'impressions' as never,
        condition: 'above',
        threshold: '1',
        window: '1d',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(
      createAlert(ctx, { adAccountId: id, metric: 'cpm', condition: 'above', threshold: '-5', window: '1d' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    const buyer = await seedMember(db, workspaceId, 'buyer');
    const bctx = { db, workspaceId, actor: (await resolveActor(db, workspaceId, buyer.id))! };
    await expect(
      createAlert(bctx, { adAccountId: null, metric: 'cpm', condition: 'above', threshold: '1', window: '1d' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await deleteAlert(ctx, a.id);
    expect(await listAlerts(ctx)).toEqual([]);
  });

  it('cách ly: workspace B không thấy / sửa / xóa cảnh báo của A, không đặt cho tài khoản của A', async () => {
    const a = await setup('A');
    const b = await setup('B');
    const al = await createAlert(a.ctx, {
      adAccountId: a.id,
      metric: 'cpm',
      condition: 'above',
      threshold: '1',
      window: '1d',
    });
    expect(await listAlerts(b.ctx)).toEqual([]);
    await expect(setAlertEnabled(b.ctx, al.id, false)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(deleteAlert(b.ctx, al.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      createAlert(b.ctx, { adAccountId: a.id, metric: 'cpm', condition: 'above', threshold: '1', window: '1d' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('worker: vượt ngưỡng → thông báo 1 lần cho ngày dữ liệu; không vượt → không báo', async () => {
    const { ctx, id } = await setup();
    const hit = await createAlert(ctx, {
      adAccountId: id,
      metric: 'spend',
      condition: 'above',
      threshold: '1',
      window: '1d',
    });
    await createAlert(ctx, { adAccountId: id, metric: 'spend', condition: 'below', threshold: '1', window: '7d' });
    const wctx = { db, workspaceId: ctx.workspaceId };
    const r1 = await runCustomAlerts(wctx, id, { clock });
    expect(r1).toEqual({ evaluated: 2, fired: 1 });
    const r2 = await runCustomAlerts(wctx, id, { clock });
    expect(r2.fired).toBe(0);
    const notes = await db.execute<{ kind: string; params: Record<string, string>; dedupe_key: string }>(
      sql`select kind, params, dedupe_key from app.notifications where workspace_id = ${ctx.workspaceId}`,
    );
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ kind: 'custom_alert', dedupe_key: `custom_alert:${hit.id}:2026-10-22` });
    expect(notes[0]!.params).toMatchObject({ cond: 'above', threshold: '1.0000', scopeAll: 'no' });
    const [raw] = await db.execute<{ spend: string }>(
      sql`select sum(spend)::text as spend from analytics.insights_daily where ad_account_id = ${id} and date = '2026-10-22'`,
    );
    expect(Number(notes[0]!.params.value)).toBe(Number(raw!.spend));
  });

  it('gợi ý ngưỡng từ 30 ngày: ngưỡng nằm trong khoảng min - max; thiếu dữ liệu → không gợi ý', async () => {
    const few = await setup('few');
    expect(await alertSuggestions(few.ctx, [few.id], 'Asia/Ho_Chi_Minh', clock)).toEqual([]);
    const { ctx, id } = await setup('full', true);
    const s = await alertSuggestions(ctx, [id], 'Asia/Ho_Chi_Minh', clock);
    expect(s.length).toBeGreaterThan(0);
    const cpm = s.find((x) => x.metric === 'cpm')!;
    expect(cpm.condition).toBe('above');
    expect(Number(cpm.min)).toBeLessThanOrEqual(Number(cpm.threshold));
    expect(Number(cpm.threshold)).toBeLessThanOrEqual(Number(cpm.max));
    const ctr = s.find((x) => x.metric === 'ctr');
    if (ctr) expect(ctr.condition).toBe('below');
  }, 120_000);
});

describe('trang chủ Workspace (W4)', () => {
  it('KPI kỳ này / kỳ trước, sparkline theo ngày, độ phủ dữ liệu, sức khỏe, Pixel trong phạm vi', async () => {
    const { ctx, id } = await setup();
    const cur = { from: '2026-10-16', to: '2026-10-22' };
    const prev = { from: '2026-10-09', to: '2026-10-15' };
    const h = await workspaceHome(ctx, { ids: [id], metaAccountIds: ['act_100000001'], cur, prev }, [
      'spend',
      'cpa',
      'roas',
      'ctr',
    ]);
    const [raw] = await db.execute<{ spend: string }>(
      sql`select sum(spend)::text as spend from analytics.insights_daily where ad_account_id = ${id} and date between '2026-10-16' and '2026-10-22'`,
    );
    expect(h.kpis.map((k) => k.key)).toEqual(['spend', 'cpa', 'roas', 'ctr']);
    expect(Number(h.kpis[0]!.cur)).toBe(Number(raw!.spend));
    expect(h.kpis[0]!.series).toHaveLength(7);
    expect(h.coverage.total).toBe(7);
    expect(h.coverage.days).toBeGreaterThan(0);
    expect(h.health.score).toBe(100);
    expect(h.pixels).toHaveLength(1);
  });

  it('nhãn sức khỏe và KPI mặc định theo mục tiêu Client', () => {
    expect([healthLabel(90), healthLabel(70), healthLabel(50), healthLabel(10)]).toEqual([
      'excellent',
      'good',
      'fair',
      'poor',
    ]);
    expect(defaultHomeMetrics(null)).toEqual(['spend', 'purchase_value', 'roas', 'cost_per_purchase']);
    expect(defaultHomeMetrics({ primaryMetric: 'cpl', secondaryMetrics: ['ctr'] })).toEqual([
      'spend',
      'cpl',
      'ctr',
      'results',
    ]);
  });
});
