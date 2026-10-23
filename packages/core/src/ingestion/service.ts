import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import type { Enqueue } from '@adxlens/jobs';
import { DEFAULT_ATTRIBUTION, MetaApiError, type MetaInsight, type MetaReadApi } from '@adxlens/meta-client';
import { markConnectionExpired, withConnectionToken, type TokenKeys } from '@adxlens/core/connections';
import {
  AppError,
  addDays,
  daysBetween,
  localDate,
  notFound,
  systemClock,
  type Clock,
  type WorkspaceCtx,
} from '@adxlens/core/shared';
import { extractResult, resultActionTypes, toDecimal } from './results';

const { adAccounts, entities, insightsDaily, syncRuns } = schema;

/** Backfill 90 ngày, lô 7 ngày, lô gần nhất chạy trước (L3 6.3, roadmap 012). */
export const BACKFILL_DAYS = 90;
export const BATCH_DAYS = 7;
/** Daily sync lấy lại 3 ngày gần nhất vì Meta cập nhật muộn (L3 6.3). */
export const DAILY_LOOKBACK_DAYS = 3;
/** Giờ địa phương của ad account để chạy daily sync (L3 6.3: 03:00). */
export const DAILY_SYNC_HOUR = 3;
export const ATTRIBUTION_WINDOW = DEFAULT_ATTRIBUTION.join('_');

export type SyncDeps = {
  meta: MetaReadApi;
  keys: TokenKeys;
  clock?: Clock;
  /** Có thì lần chạy xong sẽ enqueue đối chiếu cho khoảng ngày của nó (L3 7.3). */
  enqueue?: Enqueue;
};

/** Chia [from, to] thành lô `size` ngày, lô mới nhất trước. */
export function planBatches(from: string, to: string, size = BATCH_DAYS): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  for (let end = to; end >= from; end = addDays(end, -size)) {
    const start = addDays(end, -(size - 1));
    out.push({ from: start < from ? from : start, to: end });
  }
  return out;
}

async function getAccount(ctx: WorkspaceCtx, adAccountId: string) {
  const [a] = await ctx.db
    .select()
    .from(adAccounts)
    .where(and(eq(adAccounts.workspaceId, ctx.workspaceId), eq(adAccounts.id, adAccountId)));
  if (!a) throw notFound('Tài khoản QC');
  return a;
}

/**
 * Bắt đầu backfill 90 ngày cho tài khoản (ADR-0005: ngay khi nhập ở S04). Idempotent: đã có backfill
 * đang chạy hoặc đã xong thì trả lại lần đó; lần trước lỗi thì tạo lần mới.
 */
export async function startBackfill(
  ctx: WorkspaceCtx,
  adAccountId: string,
  deps: { enqueue: Enqueue; clock?: Clock },
): Promise<{ syncRunId: string; created: boolean }> {
  const account = await getAccount(ctx, adAccountId);
  const [existing] = await ctx.db
    .select({ id: syncRuns.id })
    .from(syncRuns)
    .where(
      and(
        eq(syncRuns.workspaceId, ctx.workspaceId),
        eq(syncRuns.adAccountId, adAccountId),
        eq(syncRuns.kind, 'backfill'),
        inArray(syncRuns.status, ['queued', 'running', 'succeeded']),
      ),
    )
    .limit(1);
  if (existing) return { syncRunId: existing.id, created: false };

  const today = localDate((deps.clock ?? systemClock).now(), account.timezone);
  const to = addDays(today, -1);
  const from = addDays(today, -BACKFILL_DAYS);
  const batches = planBatches(from, to);
  const [run] = await ctx.db
    .insert(syncRuns)
    .values({
      workspaceId: ctx.workspaceId,
      adAccountId,
      kind: 'backfill',
      dateFrom: from,
      dateTo: to,
      batchesTotal: batches.length,
      daysTotal: BACKFILL_DAYS,
    })
    .returning({ id: syncRuns.id });
  await ctx.db
    .update(adAccounts)
    .set({ syncStatus: 'syncing' })
    .where(and(eq(adAccounts.workspaceId, ctx.workspaceId), eq(adAccounts.id, adAccountId)));
  for (const b of batches) {
    await deps.enqueue('sync:backfill_account', {
      workspaceId: ctx.workspaceId,
      adAccountId,
      from: b.from,
      to: b.to,
      syncRunId: run!.id,
    });
  }
  return { syncRunId: run!.id, created: true };
}

/** Khoảng tối đa của một lần đồng bộ lại thủ công / playbook. */
export const MAX_RESYNC_DAYS = BACKFILL_DAYS;

/**
 * Đồng bộ lại một khoảng ngày (D04 "Chạy lại đồng bộ", playbook `reconcile_retry`): lần chạy "manual",
 * lô 7 ngày, có thể hoãn (`delayMs`). Xong thì tự đối chiếu lại.
 */
export async function startManualSync(
  ctx: WorkspaceCtx,
  adAccountId: string,
  range: { from: string; to: string },
  deps: { enqueue: Enqueue; clock?: Clock; delayMs?: number },
): Promise<{ syncRunId: string }> {
  const account = await getAccount(ctx, adAccountId);
  const yesterday = addDays(localDate((deps.clock ?? systemClock).now(), account.timezone), -1);
  const to = range.to > yesterday ? yesterday : range.to;
  const days = daysBetween(range.from, to) + 1;
  if (days < 1 || days > MAX_RESYNC_DAYS) {
    throw new AppError('VALIDATION_FAILED', 'Khoảng ngày không hợp lệ', { max_days: MAX_RESYNC_DAYS });
  }
  const batches = planBatches(range.from, to);
  const [run] = await ctx.db
    .insert(syncRuns)
    .values({
      workspaceId: ctx.workspaceId,
      adAccountId,
      kind: 'manual',
      dateFrom: range.from,
      dateTo: to,
      batchesTotal: batches.length,
      daysTotal: days,
    })
    .returning({ id: syncRuns.id });
  for (const b of batches) {
    await deps.enqueue(
      'sync:backfill_account',
      { workspaceId: ctx.workspaceId, adAccountId, from: b.from, to: b.to, syncRunId: run!.id },
      deps.delayMs ? { delayMs: deps.delayMs } : undefined,
    );
  }
  return { syncRunId: run!.id };
}

/** Đồng bộ cấu trúc campaign/ad set/ad/creative (upsert). */
async function syncStructure(ctx: WorkspaceCtx, adAccountId: string, act: string, token: string, meta: MetaReadApi) {
  const [campaigns, adsets, ads, creatives] = await Promise.all([
    meta.listCampaigns(token, act),
    meta.listAdSets(token, act),
    meta.listAds(token, act),
    meta.listCreatives(token, act),
  ]);
  const base = { workspaceId: ctx.workspaceId, adAccountId };
  const money = (v: string | null | undefined) => (v ? toDecimal(v) : null);
  const rows: (typeof entities.$inferInsert)[] = [
    ...campaigns.map((c) => ({
      ...base,
      entityType: 'campaign' as const,
      metaId: c.id,
      parentMetaId: null,
      name: c.name ?? null,
      status: c.effective_status ?? c.status ?? null,
      objective: c.objective ?? null,
      dailyBudget: money(c.daily_budget),
      learningStage: null,
      attrs: { lifetime_budget: c.lifetime_budget ?? null },
    })),
    ...adsets.map((s) => ({
      ...base,
      entityType: 'adset' as const,
      metaId: s.id,
      parentMetaId: s.campaign_id,
      name: s.name ?? null,
      status: s.effective_status ?? s.status ?? null,
      objective: null,
      dailyBudget: money(s.daily_budget),
      learningStage: s.learning_stage_info?.status ?? null,
      attrs: {
        optimization_goal: s.optimization_goal ?? null,
        custom_event_type: (s.promoted_object?.custom_event_type as string | undefined) ?? null,
        lifetime_budget: s.lifetime_budget ?? null,
      },
    })),
    ...ads.map((a) => ({
      ...base,
      entityType: 'ad' as const,
      metaId: a.id,
      parentMetaId: a.adset_id,
      name: a.name ?? null,
      status: a.effective_status ?? a.status ?? null,
      objective: null,
      dailyBudget: null,
      learningStage: null,
      attrs: { creative_id: a.creative?.id ?? null, campaign_id: a.campaign_id ?? null },
    })),
    ...creatives.map((c) => ({
      ...base,
      entityType: 'creative' as const,
      metaId: c.id,
      parentMetaId: null,
      name: c.name ?? null,
      status: null,
      objective: null,
      dailyBudget: null,
      learningStage: null,
      attrs: {
        thumbnail_url: c.thumbnail_url ?? null,
        image_url: c.image_url ?? null,
        format: c.object_type ?? null,
        video_id: c.video_id ?? null,
      },
    })),
  ];
  for (let i = 0; i < rows.length; i += 500) {
    await ctx.db
      .insert(entities)
      .values(rows.slice(i, i + 500))
      .onConflictDoUpdate({
        target: [entities.adAccountId, entities.entityType, entities.metaId],
        set: {
          parentMetaId: sql`excluded.parent_meta_id`,
          name: sql`excluded.name`,
          status: sql`excluded.status`,
          objective: sql`excluded.objective`,
          dailyBudget: sql`excluded.daily_budget`,
          learningStage: sql`excluded.learning_stage`,
          attrs: sql`excluded.attrs`,
          updatedAt: sql`now()`,
        },
      });
  }
}

/** Mục tiêu tối ưu theo ad set, để tính `results` đúng loại (L3 6.3). */
async function adsetGoals(ctx: WorkspaceCtx, adAccountId: string) {
  const rows = await ctx.db
    .select({ metaId: entities.metaId, attrs: entities.attrs })
    .from(entities)
    .where(
      and(
        eq(entities.workspaceId, ctx.workspaceId),
        eq(entities.adAccountId, adAccountId),
        eq(entities.entityType, 'adset'),
      ),
    );
  return new Map(
    rows.map((r) => [
      r.metaId,
      resultActionTypes(
        r.attrs.optimization_goal as string | null | undefined,
        r.attrs.custom_event_type as string | null | undefined,
      ),
    ]),
  );
}

/** Insight cấp ad của Meta → dòng `insights_daily`. */
export function toInsightRow(
  ctx: { workspaceId: string },
  adAccountId: string,
  r: MetaInsight,
  resultTypes: readonly string[],
): typeof insightsDaily.$inferInsert {
  const res = extractResult(resultTypes, r.actions, r.action_values);
  return {
    workspaceId: ctx.workspaceId,
    adAccountId,
    entityType: 'ad',
    metaId: r.ad_id!,
    campaignId: r.campaign_id ?? null,
    adsetId: r.adset_id ?? null,
    date: r.date_start,
    spend: toDecimal(r.spend),
    impressions: Number(r.impressions),
    reach: Number(r.reach),
    frequency: r.frequency ? toDecimal(r.frequency) : null,
    clicks: Number(r.clicks),
    linkClicks: Number(r.inline_link_clicks ?? 0),
    results: res.results,
    resultType: res.resultType,
    conversionValue: res.conversionValue,
    attributionWindow: ATTRIBUTION_WINDOW,
    actions: (r.actions ?? []).map((a) => ({ action_type: a.action_type, value: a.value })),
  };
}

export type SyncOutcome = { status: 'ok'; rows: number; runDone: boolean } | { status: 'failed'; error: string };

/**
 * Đồng bộ một khoảng ngày cho một lần chạy (worker). Lô đầu tiên (hoặc khi chưa có cấu trúc) đồng bộ
 * cấu trúc trước. Lỗi token → kết nối hết hạn; mất quyền → `no_access`; cả hai không retry. Lỗi tạm
 * thời được ném lại để BullMQ retry; `finalAttempt` thì ghi lỗi vào lần chạy.
 */
export async function syncRange(
  ctx: WorkspaceCtx,
  input: { syncRunId: string; adAccountId: string; from: string; to: string; finalAttempt?: boolean },
  deps: SyncDeps,
): Promise<SyncOutcome> {
  const account = await getAccount(ctx, input.adAccountId);
  const [run] = await ctx.db
    .select()
    .from(syncRuns)
    .where(
      and(
        eq(syncRuns.workspaceId, ctx.workspaceId),
        eq(syncRuns.id, input.syncRunId),
        eq(syncRuns.adAccountId, input.adAccountId),
      ),
    );
  if (!run) throw notFound('Lần đồng bộ');
  if (run.status === 'failed' || run.status === 'succeeded') return { status: 'ok', rows: 0, runDone: true };
  await ctx.db
    .update(syncRuns)
    .set({ status: 'running', startedAt: run.startedAt ?? new Date() })
    .where(and(eq(syncRuns.workspaceId, ctx.workspaceId), eq(syncRuns.id, run.id)));

  let rows: (typeof insightsDaily.$inferInsert)[];
  try {
    rows = await withConnectionToken(ctx, account.connectionId, deps.keys, async (token) => {
      let goals = await adsetGoals(ctx, account.id);
      if (input.to === run.dateTo || goals.size === 0) {
        await syncStructure(ctx, account.id, account.metaAccountId, token, deps.meta);
        goals = await adsetGoals(ctx, account.id);
      }
      const insights = await deps.meta.getInsights(token, account.metaAccountId, {
        level: 'ad',
        since: input.from,
        until: input.to,
        attributionWindows: DEFAULT_ATTRIBUTION,
      });
      return insights
        .filter((r) => r.ad_id)
        .map((r) => toInsightRow(ctx, account.id, r, goals.get(r.adset_id ?? '') ?? []));
    });
  } catch (e) {
    if (e instanceof MetaApiError && e.isTokenInvalid) {
      await markConnectionExpired(ctx, account.connectionId);
      return failRun(ctx, run.id, account.id, 'META_TOKEN_INVALID', 'error');
    }
    if (e instanceof MetaApiError && e.isPermission) {
      return failRun(ctx, run.id, account.id, 'META_NO_ACCESS', 'no_access');
    }
    if (input.finalAttempt) {
      const code = e instanceof MetaApiError ? (e.isRateLimit ? 'META_RATE_LIMITED' : 'META_ERROR') : 'SYNC_ERROR';
      await failRun(ctx, run.id, account.id, code, 'error');
    }
    throw e;
  }

  for (let i = 0; i < rows.length; i += 500) {
    await ctx.db
      .insert(insightsDaily)
      .values(rows.slice(i, i + 500))
      .onConflictDoUpdate({
        target: [insightsDaily.adAccountId, insightsDaily.entityType, insightsDaily.metaId, insightsDaily.date],
        set: {
          campaignId: sql`excluded.campaign_id`,
          adsetId: sql`excluded.adset_id`,
          spend: sql`excluded.spend`,
          impressions: sql`excluded.impressions`,
          reach: sql`excluded.reach`,
          frequency: sql`excluded.frequency`,
          clicks: sql`excluded.clicks`,
          linkClicks: sql`excluded.link_clicks`,
          results: sql`excluded.results`,
          resultType: sql`excluded.result_type`,
          conversionValue: sql`excluded.conversion_value`,
          attributionWindow: sql`excluded.attribution_window`,
          actions: sql`excluded.actions`,
          fetchedAt: sql`now()`,
        },
      });
  }

  // Cộng tiến độ nguyên tử: các lô chạy song song.
  const [updated] = await ctx.db
    .update(syncRuns)
    .set({
      batchesDone: sql`${syncRuns.batchesDone} + 1`,
      daysDone: sql`least(${syncRuns.daysTotal}, ${syncRuns.daysDone} + ${daysBetween(input.from, input.to) + 1})`,
      rowsWritten: sql`${syncRuns.rowsWritten} + ${rows.length}`,
    })
    .where(and(eq(syncRuns.workspaceId, ctx.workspaceId), eq(syncRuns.id, run.id)))
    .returning({ done: syncRuns.batchesDone, total: syncRuns.batchesTotal });
  const runDone = updated!.done >= updated!.total;
  if (runDone) {
    await finishRun(ctx, run.id, account.id, account.timezone, deps.clock ?? systemClock);
    await deps.enqueue?.('reconcile:account', {
      workspaceId: ctx.workspaceId,
      adAccountId: account.id,
      from: run.dateFrom,
      to: run.dateTo,
    });
  }
  return { status: 'ok', rows: rows.length, runDone };
}

async function finishRun(ctx: WorkspaceCtx, runId: string, adAccountId: string, tz: string, clock: Clock) {
  const now = clock.now();
  await ctx.db
    .update(syncRuns)
    .set({ status: 'succeeded', finishedAt: now })
    .where(and(eq(syncRuns.workspaceId, ctx.workspaceId), eq(syncRuns.id, runId)));
  const today = localDate(now, tz);
  const [spend] = await ctx.db
    .select({ total: sql<string>`coalesce(sum(${insightsDaily.spend}), 0)::text` })
    .from(insightsDaily)
    .where(
      and(
        eq(insightsDaily.workspaceId, ctx.workspaceId),
        eq(insightsDaily.adAccountId, adAccountId),
        gte(insightsDaily.date, addDays(today, -30)),
        lte(insightsDaily.date, addDays(today, -1)),
      ),
    );
  await ctx.db
    .update(adAccounts)
    .set({ syncStatus: 'ok', lastSyncedAt: now, active30d: Number(spend?.total ?? 0) > 0 })
    .where(and(eq(adAccounts.workspaceId, ctx.workspaceId), eq(adAccounts.id, adAccountId)));
}

async function failRun(
  ctx: WorkspaceCtx,
  runId: string,
  adAccountId: string,
  code: string,
  accountStatus: 'error' | 'no_access',
): Promise<SyncOutcome> {
  await ctx.db
    .update(syncRuns)
    .set({ status: 'failed', error: code, finishedAt: new Date() })
    .where(and(eq(syncRuns.workspaceId, ctx.workspaceId), eq(syncRuns.id, runId)));
  await ctx.db
    .update(adAccounts)
    .set({ syncStatus: accountStatus })
    .where(and(eq(adAccounts.workspaceId, ctx.workspaceId), eq(adAccounts.id, adAccountId)));
  return { status: 'failed', error: code };
}

/**
 * Job `sync:daily_account`: tạo lần chạy "daily" cho 3 ngày tới `date` rồi đồng bộ ngay. Đã có lần
 * daily cho cùng ngày kết thúc → bỏ qua (scheduler có thể bắn lại).
 */
export async function runDailySync(
  ctx: WorkspaceCtx,
  input: { adAccountId: string; date: string; finalAttempt?: boolean },
  deps: SyncDeps,
): Promise<SyncOutcome | { status: 'skipped' }> {
  await getAccount(ctx, input.adAccountId);
  const from = addDays(input.date, -(DAILY_LOOKBACK_DAYS - 1));
  const [prev] = await ctx.db
    .select({ id: syncRuns.id, status: syncRuns.status })
    .from(syncRuns)
    .where(
      and(
        eq(syncRuns.workspaceId, ctx.workspaceId),
        eq(syncRuns.adAccountId, input.adAccountId),
        eq(syncRuns.kind, 'daily'),
        eq(syncRuns.dateTo, input.date),
      ),
    )
    .orderBy(desc(syncRuns.createdAt))
    .limit(1);
  if (prev?.status === 'succeeded') return { status: 'skipped' };
  const runId =
    prev && prev.status !== 'failed'
      ? prev.id
      : (
          await ctx.db
            .insert(syncRuns)
            .values({
              workspaceId: ctx.workspaceId,
              adAccountId: input.adAccountId,
              kind: 'daily',
              dateFrom: from,
              dateTo: input.date,
              batchesTotal: 1,
              daysTotal: DAILY_LOOKBACK_DAYS,
            })
            .returning({ id: syncRuns.id })
        )[0]!.id;
  return syncRange(
    ctx,
    { syncRunId: runId, adAccountId: input.adAccountId, from, to: input.date, finalAttempt: input.finalAttempt },
    deps,
  );
}

export type SyncStatus = {
  status: 'pending' | 'queued' | 'running' | 'succeeded' | 'failed';
  kind: 'backfill' | 'daily' | 'manual' | null;
  progress: { daysDone: number; daysTotal: number };
  error: string | null;
  lastSyncedAt: Date | null;
};

/** Trạng thái đồng bộ của nhiều tài khoản (S06, `GET /ad-accounts/{id}/sync-status`). */
export async function syncStatuses(ctx: WorkspaceCtx, adAccountIds: string[]): Promise<Map<string, SyncStatus>> {
  const out = new Map<string, SyncStatus>();
  if (!adAccountIds.length) return out;
  const [accounts, runs] = await Promise.all([
    ctx.db
      .select({ id: adAccounts.id, lastSyncedAt: adAccounts.lastSyncedAt })
      .from(adAccounts)
      .where(and(eq(adAccounts.workspaceId, ctx.workspaceId), inArray(adAccounts.id, adAccountIds))),
    ctx.db
      .selectDistinctOn([syncRuns.adAccountId])
      .from(syncRuns)
      .where(and(eq(syncRuns.workspaceId, ctx.workspaceId), inArray(syncRuns.adAccountId, adAccountIds)))
      // Lần đồng bộ lại đã lên lịch nhưng chưa chạy (playbook hoãn 24 giờ) không che lần đã xong.
      .orderBy(
        syncRuns.adAccountId,
        sql`(${syncRuns.status} = 'queued' and ${syncRuns.kind} <> 'backfill')`,
        desc(syncRuns.createdAt),
      ),
  ]);
  const byAccount = new Map(runs.map((r) => [r.adAccountId, r]));
  for (const a of accounts) {
    const r = byAccount.get(a.id);
    out.set(a.id, {
      status: r?.status ?? 'pending',
      kind: r?.kind ?? null,
      progress: { daysDone: r?.daysDone ?? 0, daysTotal: r?.daysTotal ?? 0 },
      error: r?.error ?? null,
      lastSyncedAt: a.lastSyncedAt,
    });
  }
  return out;
}
