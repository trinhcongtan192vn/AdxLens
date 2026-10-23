import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@adxlens/db';
import { closeTestDb, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { recordingEnqueue } from '@adxlens/jobs';
import { MOCK_ACCOUNTS, MOCK_DISCREPANCY, MockMetaRead } from '@adxlens/meta-client/mock';
import { importAccounts, keysFromEnv, saveConnection } from '@adxlens/core/connections';
import { startBackfill, syncRange } from '@adxlens/core/ingestion';
import { addDays } from '@adxlens/core/shared';
import { resolveActor } from '@adxlens/core/tenancy';
import {
  accountReconciliation,
  coverageMarkdown,
  dataCoverageReport,
  RECONCILE_RETRY_DELAY_MS,
  RECONCILIATION_THRESHOLD_PCT,
  reconcileAccount,
  reconciliationDetail,
  roas,
  statusFor,
} from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());
const KEYS = keysFromEnv({ TOKEN_ENC_KEY_V1: Buffer.alloc(32, 9).toString('base64') });
// 10:00 ngày 23/10 giờ Việt Nam → hôm qua = 22/10; ngày lệch của mock = 20/10.
const now = () => new Date('2026-10-23T03:00:00Z');
const clock = { now };
const meta = new MockMetaRead(now);
const LECH = addDays('2026-10-23', -MOCK_DISCREPANCY.daysAgo);

async function synced(act: string) {
  const { workspace, owner } = await seedWorkspace(db);
  const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
  const { connectionId } = await saveConnection(
    ctx,
    { token: 'mock-read-r', expiresAt: null, scopes: ['ads_read'], metaUser: { id: 'mr' }, accounts: MOCK_ACCOUNTS },
    KEYS,
  );
  const [a] = await importAccounts(ctx, { connectionId, metaAccountIds: [act] });
  const enqueue = recordingEnqueue();
  await startBackfill(ctx, a!.adAccountId, { enqueue, clock });
  // Chỉ chạy 2 lô gần nhất (14 ngày) cho nhanh; lô cuối cùng kích hoạt đối chiếu khi đủ lô.
  for (const c of enqueue.calls.slice(0, 2)) {
    await syncRange(ctx, c.payload as never, { meta, keys: KEYS.keys, clock });
  }
  return { ctx, adAccountId: a!.adAccountId };
}

describe('ngưỡng đối chiếu (khóa)', () => {
  it('ngưỡng là đúng 1% — đổi giá trị này cần task + ADR (CLAUDE.md quy tắc 4)', () => {
    expect(RECONCILIATION_THRESHOLD_PCT).toBe('1.000000');
  });
  it('≤ 1% là khớp, > 1% là lệch, xét cả chi tiêu và kết quả', () => {
    expect(statusFor('1.000000', '0')).toBe('ok');
    expect(statusFor('1.000001', '0')).toBe('warning');
    expect(statusFor('0', '1.000001')).toBe('warning');
  });
  it('ROAS không qua float', () => {
    expect(roas('2318400000', '615900000')).toBe('3.7642'); // 3,764247…
    expect(roas('100', '0')).toBe('0.0000');
  });
});

describe('đối chiếu tài khoản', () => {
  it('tài khoản khớp: mọi ngày ok, chi tiêu lệch 0', async () => {
    const { ctx, adAccountId } = await synced('act_100000001');
    const r = await reconcileAccount(
      ctx,
      { adAccountId, from: '2026-10-09', to: '2026-10-22' },
      { meta, keys: KEYS.keys, clock },
    );
    expect(r).toMatchObject({ status: 'ok', days: 14, warningDates: [], maxSpendDeltaPct: '0.000000' });
    const rows = await db.select().from(schema.reconciliationResults);
    expect(rows).toHaveLength(14);
    expect(rows.every((x) => x.status === 'ok' && x.resultsDeltaPct === '0.000000')).toBe(true);
    expect(rows[0]!.resultTypes.length).toBeGreaterThan(0);
  });

  it('Meta lệch 1,4% đúng một ngày → ngày đó warning, sự cố P2, playbook đồng bộ lại sau 24 giờ', async () => {
    const { ctx, adAccountId } = await synced(MOCK_DISCREPANCY.account);
    const enqueue = recordingEnqueue();
    const r = await reconcileAccount(
      ctx,
      { adAccountId, from: '2026-10-09', to: '2026-10-22' },
      { meta, keys: KEYS.keys, clock, enqueue },
    );
    expect(r.status).toBe('warning');
    if (r.status !== 'warning') return;
    expect(r.warningDates).toEqual([LECH]);
    // 1/1.014 − 1 ≈ 1,38%
    expect(Number(r.maxSpendDeltaPct)).toBeCloseTo(1.3807, 3);

    const incidents = await db.select().from(schema.opsIncidents);
    expect(incidents).toMatchObject([
      { kind: 'reconciliation_warning', severity: 'P2', adAccountId, workspaceId: ctx.workspaceId, status: 'open' },
    ]);
    // P0-25: owner nhận thông báo lệch (bắt buộc, có email).
    const notes = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.kind, 'reconciliation_warning'));
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ emailStatus: 'queued', params: { dates: LECH } });
    const sync = enqueue.calls.filter((c) => c.name === 'sync:backfill_account');
    expect(sync).toHaveLength(1);
    expect(sync[0]).toMatchObject({
      name: 'sync:backfill_account',
      payload: { adAccountId, from: LECH, to: LECH },
      opts: { delayMs: RECONCILE_RETRY_DELAY_MS },
    });

    // Lần 2 trong ngày: playbook vượt giới hạn 1 lần/ngày → leo thang, không lên lịch thêm; không báo trùng.
    await reconcileAccount(
      ctx,
      { adAccountId, from: '2026-10-09', to: '2026-10-22' },
      { meta, keys: KEYS.keys, clock, enqueue },
    );
    expect(enqueue.calls.filter((c) => c.name === 'sync:backfill_account')).toHaveLength(1);
    expect(enqueue.calls.filter((c) => c.name === 'notify:send_email')).toHaveLength(1);
    const runs = await db.execute<{ result: string }>(sql`select result from app.ops_playbook_runs order by at`);
    expect(runs.map((x) => x.result)).toEqual(['done', 'escalated']);

    // Badge 7 ngày + chi tiết D04.
    const badge = (await accountReconciliation(ctx, [adAccountId], clock)).get(adAccountId)!;
    expect(badge.status).toBe('warning');
    const d = await reconciliationDetail(ctx, adAccountId, { from: '2026-10-16', to: '2026-10-22' });
    expect(d.status).toBe('warning');
    expect(d.warningDates).toEqual([LECH]);
    const spend = d.metrics.find((m) => m.key === 'spend')!;
    expect(spend.ok).toBe(true); // tổng 7 ngày lệch < 1% dù một ngày lệch
    expect(d.metrics.map((m) => m.key)).toEqual(
      expect.arrayContaining(['spend', 'impressions', 'linkClicks', 'conversionValue', 'roas']),
    );
    expect(d.metrics.some((m) => m.key.startsWith('result:'))).toBe(true);
  });

  it('hết lệch thì đóng sự cố', async () => {
    const { ctx, adAccountId } = await synced(MOCK_DISCREPANCY.account);
    await reconcileAccount(ctx, { adAccountId, from: LECH, to: LECH }, { meta, keys: KEYS.keys, clock });
    // Sửa số nội bộ cho khớp Meta (giả lập đồng bộ lại đã lấy được số đúng).
    const [m] = await meta.getInsights('', MOCK_DISCREPANCY.account, { level: 'account', since: LECH, until: LECH });
    const [row] = await db.execute<{ spend: string }>(
      sql`select sum(spend)::text as spend from analytics.insights_daily where ad_account_id = ${adAccountId} and date = ${LECH}`,
    );
    await db.execute(sql`update analytics.insights_daily set spend = spend * (${m!.spend}::numeric / ${row!.spend}::numeric)
      where ad_account_id = ${adAccountId} and date = ${LECH}`);
    const r = await reconcileAccount(ctx, { adAccountId, from: LECH, to: LECH }, { meta, keys: KEYS.keys, clock });
    expect(r.status).toBe('ok');
    const [inc] = await db.select().from(schema.opsIncidents);
    expect(inc!.status).toBe('resolved');
  });

  it('thiếu dữ liệu nội bộ một ngày Meta có chi tiêu → warning (không bỏ qua ngày thiếu)', async () => {
    const { ctx, adAccountId } = await synced('act_100000001');
    await db.execute(
      sql`delete from analytics.insights_daily where ad_account_id = ${adAccountId} and date = '2026-10-15'`,
    );
    const r = await reconcileAccount(
      ctx,
      { adAccountId, from: '2026-10-15', to: '2026-10-15' },
      { meta, keys: KEYS.keys, clock },
    );
    expect(r).toMatchObject({ status: 'warning', warningDates: ['2026-10-15'] });
  });

  it('chưa có dữ liệu đối chiếu → pending', async () => {
    const { ctx, adAccountId } = await synced('act_100000001');
    expect((await accountReconciliation(ctx, [adAccountId], clock)).get(adAccountId)!.status).toBe('pending');
    expect((await reconciliationDetail(ctx, adAccountId, { from: '2026-10-16', to: '2026-10-22' })).status).toBe(
      'pending',
    );
  });

  it('không đối chiếu tài khoản của workspace khác', async () => {
    const { adAccountId } = await synced('act_100000001');
    const other = await seedWorkspace(db);
    await expect(
      reconcileAccount(
        { db, workspaceId: other.workspace.id },
        { adAccountId, from: '2026-10-22', to: '2026-10-22' },
        { meta, keys: KEYS.keys, clock },
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const rows = await db
      .select()
      .from(schema.reconciliationResults)
      .where(eq(schema.reconciliationResults.adAccountId, adAccountId));
    expect(rows).toEqual([]);
  });
});

describe('báo cáo E4', () => {
  it('đếm ngày dữ liệu, đối chiếu, mức phủ chỉ số và cấu trúc; chỉ trong workspace', async () => {
    const { ctx, adAccountId } = await synced(MOCK_DISCREPANCY.account);
    await reconcileAccount(
      ctx,
      { adAccountId, from: '2026-10-09', to: '2026-10-22' },
      { meta, keys: KEYS.keys, clock },
    );
    const other = await synced('act_100000001');
    const rows = await dataCoverageReport(ctx, { from: '2026-10-09', to: '2026-10-22' });
    expect(rows).toHaveLength(1);
    const r = rows[0]!;
    expect(r.adAccountId).not.toBe(other.adAccountId);
    expect(r).toMatchObject({
      daysWithData: 14,
      reconciliation: { days: 14, warningDays: 1 },
      entities: { campaign: 3 },
    });
    expect(r.coverage.frequency).toBe(1);
    expect(r.coverage.conversionValue).toBeGreaterThan(0);
    expect(r.creativesWithThumbnail).toBe(r.entities.creative);
    const md = coverageMarkdown(rows, { from: '2026-10-09', to: '2026-10-22' });
    expect(md).toContain('| Thời trang Linh (act_100000002) | 14 | 14 | 1 |');
  });
});
