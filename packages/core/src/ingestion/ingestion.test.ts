import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@adxlens/db';
import { closeTestDb, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { recordingEnqueue } from '@adxlens/jobs';
import { MetaApiError } from '@adxlens/meta-client';
import { MOCK_ACCOUNTS, MockMetaRead } from '@adxlens/meta-client/mock';
import { importAccounts, keysFromEnv, listConnections, saveConnection } from '@adxlens/core/connections';
import { resolveActor } from '@adxlens/core/tenancy';
import {
  BACKFILL_DAYS,
  extractResult,
  planBatches,
  resultActionTypes,
  runDailySync,
  startBackfill,
  startManualSync,
  syncRange,
  syncStatuses,
  toDecimal,
} from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());
const KEYS = keysFromEnv({ TOKEN_ENC_KEY_V1: Buffer.alloc(32, 5).toString('base64') });
// 01:00 ngày 23/10 giờ Việt Nam.
const now = () => new Date('2026-10-22T18:00:00Z');
const clock = { now };
const meta = new MockMetaRead(now);

async function setup(act = 'act_100000001') {
  const { workspace, owner } = await seedWorkspace(db);
  const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
  const { connectionId } = await saveConnection(
    ctx,
    { token: 'mock-read-1', expiresAt: null, scopes: ['ads_read'], metaUser: { id: 'm1' }, accounts: MOCK_ACCOUNTS },
    KEYS,
  );
  const [imported] = await importAccounts(ctx, { connectionId, metaAccountIds: [act] });
  return { ctx, adAccountId: imported!.adAccountId, connectionId };
}

type BackfillJob = { adAccountId: string; from: string; to: string; syncRunId: string };

async function runAll(ctx: { db: typeof db; workspaceId: string }, jobs: BackfillJob[]) {
  for (const j of jobs) await syncRange(ctx, j, { meta, keys: KEYS.keys, clock });
}

describe('chia lô backfill', () => {
  it('90 ngày → 13 lô 7 ngày, mới nhất trước, phủ đủ không chồng', () => {
    const b = planBatches('2026-07-25', '2026-10-22');
    expect(b).toHaveLength(13);
    expect(b[0]).toEqual({ from: '2026-10-16', to: '2026-10-22' });
    expect(b.at(-1)!.from).toBe('2026-07-25');
    const days = b.reduce((n, x) => n + (Date.parse(x.to) - Date.parse(x.from)) / 86_400_000 + 1, 0);
    expect(days).toBe(BACKFILL_DAYS);
  });
});

describe('kết quả theo mục tiêu tối ưu', () => {
  it('lấy action đúng goal, giá trị chuyển đổi cùng loại; custom event ưu tiên', () => {
    const types = resultActionTypes('OFFSITE_CONVERSIONS', 'PURCHASE');
    expect(types[0]).toBe('offsite_conversion.fb_pixel_purchase');
    expect(resultActionTypes('OFFSITE_CONVERSIONS', 'COMPLETE_REGISTRATION')[0]).toBe(
      'offsite_conversion.fb_pixel_complete_registration',
    );
    const r = extractResult(
      types,
      [
        { action_type: 'link_click', value: '50' },
        { action_type: 'offsite_conversion.fb_pixel_purchase', value: '3' },
      ],
      [{ action_type: 'offsite_conversion.fb_pixel_purchase', value: '1250000.50' }],
    );
    expect(r).toEqual({
      results: 3,
      resultType: 'offsite_conversion.fb_pixel_purchase',
      conversionValue: '1250000.50',
    });
    expect(extractResult(resultActionTypes('REACH'), [{ action_type: 'link_click', value: '1' }], [])).toEqual({
      results: 0,
      resultType: null,
      conversionValue: null,
    });
  });

  it('số tiền không đi qua float; chuỗi lạ bị từ chối', () => {
    expect(toDecimal('123456789012.3456')).toBe('123456789012.3456');
    expect(() => toDecimal('1e5')).toThrow();
    expect(() => toDecimal('abc')).toThrow();
  });
});

describe('backfill 90 ngày', () => {
  it('lên lịch 13 lô; đồng bộ xong: tổng chi tiêu/ngày khớp Meta cấp tài khoản, trạng thái ok', async () => {
    const { ctx, adAccountId } = await setup();
    const enqueue = recordingEnqueue();
    const r = await startBackfill(ctx, adAccountId, { enqueue, clock });
    expect(r.created).toBe(true);
    expect(enqueue.calls).toHaveLength(13);
    const jobs = enqueue.calls.map((c) => c.payload as BackfillJob);
    expect(jobs[0]).toMatchObject({ from: '2026-10-16', to: '2026-10-22' });
    expect((await syncStatuses(ctx, [adAccountId])).get(adAccountId)).toMatchObject({
      status: 'queued',
      progress: { daysDone: 0, daysTotal: 90 },
    });

    await runAll(ctx, jobs.slice(0, 2));
    expect((await syncStatuses(ctx, [adAccountId])).get(adAccountId)).toMatchObject({
      status: 'running',
      progress: { daysDone: 14, daysTotal: 90 },
    });
    await runAll(ctx, jobs.slice(2));
    const st = (await syncStatuses(ctx, [adAccountId])).get(adAccountId)!;
    expect(st).toMatchObject({ status: 'succeeded', progress: { daysDone: 90, daysTotal: 90 } });
    expect(st.lastSyncedAt).toEqual(now());

    const [acc] = await db.select().from(schema.adAccounts).where(eq(schema.adAccounts.id, adAccountId));
    expect(acc).toMatchObject({ syncStatus: 'ok', active30d: true });
    // P0-25: owner nhận "đồng bộ xong" một lần.
    const notes = await db.select().from(schema.notifications).where(eq(schema.notifications.kind, 'sync_done'));
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ userId: ctx.actor.userId, link: `/accounts/${adAccountId}` });

    // Tổng chi tiêu theo ngày (numeric, so chuỗi) khớp insight cấp tài khoản của Meta.
    const perDay = await db.execute<{ date: string; spend: string }>(sql`
      select date::text, sum(spend)::text as spend from analytics.insights_daily
      where ad_account_id = ${adAccountId} group by date order by date`);
    expect(perDay).toHaveLength(90);
    const metaDays = await meta.getInsights('', 'act_100000001', {
      level: 'account',
      since: '2026-07-25',
      until: '2026-10-22',
    });
    for (const m of metaDays) {
      const ours = perDay.find((d) => d.date === m.date_start)!;
      expect(Number(ours.spend), m.date_start).toBe(Number(m.spend));
    }

    // Cấu trúc + kết quả đúng loại theo mục tiêu.
    const types = await db.execute<{ entity_type: string; n: number }>(sql`
      select entity_type, count(*)::int as n from analytics.entities where ad_account_id = ${adAccountId}
      group by entity_type order by entity_type`);
    expect(Object.fromEntries(types.map((t) => [t.entity_type, t.n]))).toMatchObject({ campaign: 3 });
    const rt = await db.execute<{ result_type: string | null }>(sql`
      select distinct result_type from analytics.insights_daily where ad_account_id = ${adAccountId} order by 1`);
    expect(rt.map((x) => x.result_type)).toEqual(['lead', 'link_click', 'offsite_conversion.fb_pixel_purchase']);
  });

  it('idempotent: gọi lại không tạo lần mới; chạy lại một lô không nhân đôi dòng', async () => {
    const { ctx, adAccountId } = await setup();
    const enqueue = recordingEnqueue();
    const first = await startBackfill(ctx, adAccountId, { enqueue, clock });
    const again = await startBackfill(ctx, adAccountId, { enqueue, clock });
    expect(again).toEqual({ syncRunId: first.syncRunId, created: false });
    expect(enqueue.calls).toHaveLength(13);
    const job = enqueue.calls[0]!.payload as BackfillJob;
    await syncRange(ctx, job, { meta, keys: KEYS.keys, clock });
    const count = async () => (await db.select({ n: sql<number>`count(*)::int` }).from(schema.insightsDaily))[0]!.n;
    const n1 = await count();
    await syncRange(ctx, job, { meta, keys: KEYS.keys, clock });
    expect(await count()).toBe(n1);
  });

  it('ngày theo múi giờ của ad account', async () => {
    const { ctx, adAccountId } = await setup();
    await db
      .update(schema.adAccounts)
      .set({ timezone: 'America/Los_Angeles' })
      .where(eq(schema.adAccounts.id, adAccountId));
    await startBackfill(ctx, adAccountId, { enqueue: recordingEnqueue(), clock });
    const [run] = await db.select().from(schema.syncRuns);
    // 18:00Z 22/10 = 11:00 22/10 ở Los Angeles → tới hết 21/10.
    expect(run).toMatchObject({ dateTo: '2026-10-21', dateFrom: '2026-07-24' });
  });

  it('token bị thu hồi → lần chạy lỗi META_TOKEN_INVALID, kết nối hết hạn, không ném (không retry)', async () => {
    const { ctx, adAccountId } = await setup();
    const enqueue = recordingEnqueue();
    await startBackfill(ctx, adAccountId, { enqueue, clock });
    class Revoked extends MockMetaRead {
      override async getInsights(): Promise<never> {
        throw new MetaApiError(400, 190, null, 'OAuthException', 'expired', null);
      }
    }
    const r = await syncRange(ctx, enqueue.calls[0]!.payload as BackfillJob, {
      meta: new Revoked(now),
      keys: KEYS.keys,
      clock,
    });
    expect(r).toEqual({ status: 'failed', error: 'META_TOKEN_INVALID' });
    expect((await listConnections(ctx))[0]!.status).toBe('expired');
    expect((await syncStatuses(ctx, [adAccountId])).get(adAccountId)).toMatchObject({
      status: 'failed',
      error: 'META_TOKEN_INVALID',
    });
    // Lỗi xong thì bắt đầu lại được.
    expect((await startBackfill(ctx, adAccountId, { enqueue, clock })).created).toBe(true);
  });

  it('lỗi tạm thời: ném để retry; lần cuối ghi META_RATE_LIMITED', async () => {
    const { ctx, adAccountId } = await setup();
    const enqueue = recordingEnqueue();
    await startBackfill(ctx, adAccountId, { enqueue, clock });
    class Limited extends MockMetaRead {
      override async getInsights(): Promise<never> {
        throw new MetaApiError(400, 17, null, 'OAuthException', 'limit', null);
      }
    }
    const job = enqueue.calls[0]!.payload as BackfillJob;
    const deps = { meta: new Limited(now), keys: KEYS.keys, clock };
    await expect(syncRange(ctx, job, deps)).rejects.toBeInstanceOf(MetaApiError);
    expect((await syncStatuses(ctx, [adAccountId])).get(adAccountId)!.status).toBe('running');
    await expect(syncRange(ctx, { ...job, finalAttempt: true }, deps)).rejects.toBeInstanceOf(MetaApiError);
    expect((await syncStatuses(ctx, [adAccountId])).get(adAccountId)).toMatchObject({
      status: 'failed',
      error: 'META_RATE_LIMITED',
    });
  });

  it('mất quyền với tài khoản → no_access', async () => {
    const { ctx, adAccountId } = await setup();
    const enqueue = recordingEnqueue();
    await startBackfill(ctx, adAccountId, { enqueue, clock });
    class NoAccess extends MockMetaRead {
      override async listCampaigns(): Promise<never> {
        throw new MetaApiError(403, 200, null, 'OAuthException', 'perm', null);
      }
    }
    const r = await syncRange(ctx, enqueue.calls[0]!.payload as BackfillJob, {
      meta: new NoAccess(now),
      keys: KEYS.keys,
      clock,
    });
    expect(r).toEqual({ status: 'failed', error: 'META_NO_ACCESS' });
    const [acc] = await db.select().from(schema.adAccounts).where(eq(schema.adAccounts.id, adAccountId));
    expect(acc!.syncStatus).toBe('no_access');
  });

  it('không đồng bộ tài khoản của workspace khác', async () => {
    const { adAccountId } = await setup();
    const other = await seedWorkspace(db);
    const octx = { db, workspaceId: other.workspace.id };
    await expect(startBackfill(octx, adAccountId, { enqueue: recordingEnqueue(), clock })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('trạng thái đồng bộ', () => {
  it('lần đồng bộ lại đã lên lịch (chưa chạy) không che backfill đã xong', async () => {
    const { ctx, adAccountId } = await setup();
    const enqueue = recordingEnqueue();
    await startBackfill(ctx, adAccountId, { enqueue, clock });
    await runAll(
      ctx,
      enqueue.calls.map((c) => c.payload as BackfillJob),
    );
    await startManualSync(ctx, adAccountId, { from: '2026-10-20', to: '2026-10-20' }, { enqueue, clock, delayMs: 1 });
    expect((await syncStatuses(ctx, [adAccountId])).get(adAccountId)).toMatchObject({
      status: 'succeeded',
      kind: 'backfill',
    });
  });
});

describe('daily sync', () => {
  it('lấy 3 ngày tới `date`, upsert; chạy lại cùng ngày thì bỏ qua', async () => {
    const { ctx, adAccountId } = await setup();
    const r = await runDailySync(ctx, { adAccountId, date: '2026-10-22' }, { meta, keys: KEYS.keys, clock });
    expect(r).toMatchObject({ status: 'ok', runDone: true });
    const days = await db.execute<{ date: string }>(sql`
      select distinct date::text from analytics.insights_daily where ad_account_id = ${adAccountId} order by 1`);
    expect(days.map((d) => d.date)).toEqual(['2026-10-20', '2026-10-21', '2026-10-22']);
    expect(await runDailySync(ctx, { adAccountId, date: '2026-10-22' }, { meta, keys: KEYS.keys, clock })).toEqual({
      status: 'skipped',
    });
    const runs = await db
      .select()
      .from(schema.syncRuns)
      .where(and(eq(schema.syncRuns.adAccountId, adAccountId), eq(schema.syncRuns.kind, 'daily')));
    expect(runs).toHaveLength(1);
  });
});
