import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import type { Enqueue } from '@adxlens/jobs';
import { DEFAULT_ATTRIBUTION, MetaApiError, type MetaInsight, type MetaReadApi } from '@adxlens/meta-client';
import {
  connectionIsDemo,
  markConnectionExpired,
  metaFor,
  withConnectionToken,
  type TokenKeys,
} from '@adxlens/core/connections';
import { refreshOverLimit, syncableAccountIds } from '@adxlens/core/billing';
import { notify } from '@adxlens/core/notification';
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
import { adsetAudiences, creativeCopy, funnelStageOf } from './funnel-stage';
import { extractResult, resultActionTypes, toDecimal } from './results';

const { adAccounts, entities, insightsBreakdowns, insightsDaily, syncRuns } = schema;
const { BREAKDOWN_KEYS } = schema;

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
  // Loại custom audience để phân loại giai đoạn phễu; thiếu quyền / lỗi → null (không đoán, không chặn đồng bộ).
  const audienceList = await meta.listCustomAudiences(token, act).catch((e: unknown) => {
    if (e instanceof MetaApiError && e.isTokenInvalid) throw e;
    return null;
  });
  const audienceTypes = audienceList ? new Map(audienceList.map((a) => [a.id, a.subtype ?? null])) : null;
  const base = { workspaceId: ctx.workspaceId, adAccountId };
  const money = (v: string | null | undefined) => (v ? toDecimal(v) : null);
  // Madgicx Audience Studio "Discover Similar": gợi ý interest từ interest đang dùng nhiều nhất (chỉ đọc). Lỗi / thiếu
  // quyền → bỏ qua, không chặn đồng bộ.
  const usedInterests = new Map<string, { name: string; n: number }>();
  for (const s of adsets) {
    for (const f of s.targeting?.flexible_spec ?? []) {
      for (const i of f.interests ?? []) {
        const cur = usedInterests.get(i.id);
        usedInterests.set(i.id, { name: i.name ?? cur?.name ?? i.id, n: (cur?.n ?? 0) + 1 });
      }
    }
  }
  const seedNames = [...usedInterests.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, 10)
    .map((x) => x.name);
  const suggestions = seedNames.length
    ? await meta.suggestInterests(token, seedNames).catch((e: unknown) => {
        if (e instanceof MetaApiError && e.isTokenInvalid) throw e;
        return [];
      })
    : [];
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
        funnel_stage: funnelStageOf(
          (s.targeting?.custom_audiences ?? []).map((x) => x.id),
          audienceTypes,
        ),
        audiences: adsetAudiences(s.targeting, audienceTypes),
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
        ...creativeCopy(c),
      },
    })),
    // ADR-0023: custom audience (nguồn cho Audience Launcher) — chỉ id, tên, loại.
    ...(audienceList ?? []).map((a) => ({
      ...base,
      entityType: 'audience' as const,
      metaId: a.id,
      parentMetaId: null,
      name: a.name ?? null,
      status: null,
      objective: null,
      dailyBudget: null,
      learningStage: null,
      attrs: { subtype: a.subtype ?? null },
    })),
    ...suggestions
      .filter((x) => !usedInterests.has(x.id))
      .slice(0, 30)
      .map((x) => ({
        ...base,
        entityType: 'interest' as const,
        metaId: x.id,
        parentMetaId: null,
        name: x.name,
        status: null,
        objective: null,
        dailyBudget: null,
        learningStage: null,
        attrs: {
          audience_low: x.audience_size_lower_bound ?? null,
          audience_high: x.audience_size_upper_bound ?? null,
          path: x.path ?? [],
          from: seedNames.slice(0, 3),
        },
      })),
  ];
  // Gợi ý interest là ảnh chụp mới nhất: xóa gợi ý cũ của tài khoản trước khi ghi lại.
  if (suggestions.length || !seedNames.length) {
    await ctx.db
      .delete(entities)
      .where(
        and(
          eq(entities.workspaceId, ctx.workspaceId),
          eq(entities.adAccountId, adAccountId),
          eq(entities.entityType, 'interest'),
        ),
      );
  }
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

/** Khóa nhóm của một dòng breakdown: "25-34|female", "instagram|story", "Hanoi". */
export function breakdownKeyOf(r: MetaInsight, breakdown: (typeof BREAKDOWN_KEYS)[number]): string {
  const v = (x: string | undefined) => x?.trim() || 'unknown';
  if (breakdown === 'age_gender') return `${v(r.age)}|${v(r.gender)}`;
  if (breakdown === 'placement') return `${v(r.publisher_platform)}|${v(r.platform_position)}`;
  if (breakdown === 'country') return v(r.country).toUpperCase();
  return v(r.region);
}

export function toBreakdownRow(
  ctx: { workspaceId: string },
  adAccountId: string,
  r: MetaInsight,
  breakdown: (typeof BREAKDOWN_KEYS)[number],
  resultTypes: readonly string[],
): typeof insightsBreakdowns.$inferInsert {
  const res = extractResult(resultTypes, r.actions, r.action_values);
  return {
    workspaceId: ctx.workspaceId,
    adAccountId,
    adsetId: r.adset_id!,
    date: r.date_start,
    breakdown,
    key: breakdownKeyOf(r, breakdown),
    spend: toDecimal(r.spend),
    impressions: Number(r.impressions),
    linkClicks: Number(r.inline_link_clicks ?? 0),
    results: res.results,
  };
}

export type SyncOutcome =
  { status: 'ok'; rows: number; runDone: boolean; breakdownSkipped?: number } | { status: 'failed'; error: string };

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

  // Kết nối mẫu (S01) luôn đọc dữ liệu giả.
  const meta = metaFor({ isDemo: await connectionIsDemo(ctx, account.connectionId) }, deps.meta);
  let rows: (typeof insightsDaily.$inferInsert)[];
  const breakdownRows: (typeof insightsBreakdowns.$inferInsert)[] = [];
  let breakdownSkipped = 0;
  try {
    rows = await withConnectionToken(ctx, account.connectionId, deps.keys, async (token) => {
      let goals = await adsetGoals(ctx, account.id);
      if (input.to === run.dateTo || goals.size === 0) {
        await syncStructure(ctx, account.id, account.metaAccountId, token, meta);
        goals = await adsetGoals(ctx, account.id);
      }
      const insights = await meta.getInsights(token, account.metaAccountId, {
        level: 'ad',
        since: input.from,
        until: input.to,
        attributionWindows: DEFAULT_ATTRIBUTION,
      });
      // A4: insight theo nhóm (đối tượng / vị trí / khu vực) cấp ad set. Dữ liệu phụ cho báo cáo: Meta từ chối một
      // nhóm (vd. không hỗ trợ breakdown) → bỏ nhóm đó cho lô này, không làm hỏng đồng bộ; token hỏng vẫn ném lên.
      for (const breakdown of BREAKDOWN_KEYS) {
        try {
          const parts = await meta.getInsights(token, account.metaAccountId, {
            level: 'adset',
            since: input.from,
            until: input.to,
            attributionWindows: DEFAULT_ATTRIBUTION,
            breakdown,
          });
          breakdownRows.push(
            ...parts
              .filter((r) => r.adset_id)
              .map((r) => toBreakdownRow(ctx, account.id, r, breakdown, goals.get(r.adset_id ?? '') ?? [])),
          );
        } catch (e) {
          if (e instanceof MetaApiError && !e.isTokenInvalid && !e.isPermission && !e.isRateLimit) {
            breakdownSkipped++;
            continue;
          }
          throw e;
        }
      }
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

  for (let i = 0; i < breakdownRows.length; i += 500) {
    await ctx.db
      .insert(insightsBreakdowns)
      .values(breakdownRows.slice(i, i + 500))
      .onConflictDoUpdate({
        target: [
          insightsBreakdowns.adAccountId,
          insightsBreakdowns.adsetId,
          insightsBreakdowns.date,
          insightsBreakdowns.breakdown,
          insightsBreakdowns.key,
        ],
        set: {
          spend: sql`excluded.spend`,
          impressions: sql`excluded.impressions`,
          linkClicks: sql`excluded.link_clicks`,
          results: sql`excluded.results`,
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
    if (run.kind === 'backfill') {
      // P0-25: báo "đồng bộ xong" cho owner/manager được xem Client của tài khoản.
      await notify(
        ctx,
        {
          kind: 'sync_done',
          recipients: { roles: ['owner', 'manager'], clientId: account.clientId },
          params: { account: account.name },
          link: `/accounts/${account.id}`,
          dedupeKey: `sync_done:${run.id}`,
        },
        { enqueue: deps.enqueue },
      );
    }
    await deps.enqueue?.('reconcile:account', {
      workspaceId: ctx.workspaceId,
      adAccountId: account.id,
      from: run.dateFrom,
      to: run.dateTo,
    });
  }
  return { status: 'ok', rows: rows.length, runDone, ...(breakdownSkipped ? { breakdownSkipped } : {}) };
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
): Promise<SyncOutcome | { status: 'skipped'; reason?: 'plan_limit' }> {
  await getAccount(ctx, input.adAccountId);
  // PRD 13.3 (feature 026): cập nhật mốc vượt hạn mức; hết ân hạn 7 ngày → ngừng đồng bộ tài khoản ngoài
  // hạn mức (dữ liệu cũ giữ nguyên).
  await refreshOverLimit(ctx, deps.clock);
  const allowed = await syncableAccountIds(ctx, deps.clock);
  if (allowed && !allowed.has(input.adAccountId)) return { status: 'skipped', reason: 'plan_limit' };
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
