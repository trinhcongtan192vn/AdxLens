import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import type { Enqueue } from '@adxlens/jobs';
import { DEFAULT_ATTRIBUTION, MetaApiError, type MetaInsight, type MetaReadApi } from '@adxlens/meta-client';
import { markConnectionExpired, withConnectionToken, type TokenKeys } from '@adxlens/core/connections';
import { startManualSync } from '@adxlens/core/ingestion';
import { openIncident, resolveIncidentsByFingerprint, runPlaybook } from '@adxlens/core/ops';
import {
  addDays,
  compareDecimal,
  deltaPct,
  eachDay,
  fromScaled,
  localDate,
  notFound,
  sumDecimal,
  systemClock,
  toScaled,
  type Clock,
  type WorkspaceCtx,
} from '@adxlens/core/shared';

const { adAccounts, insightsDaily, reconciliationResults } = schema;

/**
 * Ngưỡng đối chiếu 1% (CLAUDE.md quy tắc 4, PRD): KHÔNG đổi khi không có task ghi rõ và ADR. Giá trị
 * này có test khóa (`reconciliation.test.ts`).
 */
export const RECONCILIATION_THRESHOLD_PCT = '1.000000';
/** `reconcile_retry` (L2 11.2): đồng bộ và đối chiếu lại sau 24 giờ. */
export const RECONCILE_RETRY_DELAY_MS = 24 * 3_600_000;
/** Ngày lệch trong 14 ngày gần nhất (2 cửa sổ so sánh của insight engine) thì không chạy audit. */
export const AUDIT_GUARD_DAYS = 14;
/** Cửa sổ mặc định cho badge "Khớp/Lệch" (C01, C02, S06): 7 ngày tới hôm qua. */
export const BADGE_WINDOW_DAYS = 7;

export type ReconcileDeps = { meta: MetaReadApi; keys: TokenKeys; clock?: Clock; enqueue?: Enqueue };

export function withinThreshold(pct: string): boolean {
  return compareDecimal(pct, RECONCILIATION_THRESHOLD_PCT) <= 0;
}

/** L3 6.4: ok khi chi tiêu và kết quả đều lệch ≤ 1%. */
export function statusFor(spendDeltaPct: string, resultsDeltaPct: string): 'ok' | 'warning' {
  return withinThreshold(spendDeltaPct) && withinThreshold(resultsDeltaPct) ? 'ok' : 'warning';
}

function actionValue(list: MetaInsight['actions'], type: string): string {
  return list?.find((a) => a.action_type === type)?.value ?? '0';
}

type InternalDay = {
  spend: string;
  impressions: number;
  linkClicks: number;
  conversionValue: string;
  resultTypes: string[];
  actionsByType: Record<string, number>;
};

/** Tổng AdxLens theo ngày, cộng từ insights_daily (cấp ad). */
async function internalTotals(ctx: WorkspaceCtx, adAccountId: string, from: string, to: string) {
  const base = and(
    eq(insightsDaily.workspaceId, ctx.workspaceId),
    eq(insightsDaily.adAccountId, adAccountId),
    gte(insightsDaily.date, from),
    lte(insightsDaily.date, to),
  );
  const [totals, actions] = await Promise.all([
    ctx.db
      .select({
        date: insightsDaily.date,
        spend: sql<string>`sum(${insightsDaily.spend})::text`,
        impressions: sql<number>`sum(${insightsDaily.impressions})::bigint`,
        linkClicks: sql<number>`sum(${insightsDaily.linkClicks})::bigint`,
        conversionValue: sql<string>`coalesce(sum(${insightsDaily.conversionValue}), 0)::text`,
        resultTypes: sql<
          string[]
        >`coalesce(array_agg(distinct ${insightsDaily.resultType}) filter (where ${insightsDaily.resultType} is not null), '{}')`,
      })
      .from(insightsDaily)
      .where(base)
      .groupBy(insightsDaily.date),
    // Tổng mọi action theo loại (trên mọi ad), để so đúng với insight cấp tài khoản.
    ctx.db.execute<{ date: string; type: string; value: string }>(sql`
      select i.date::text as date, a->>'action_type' as type, sum((a->>'value')::numeric)::text as value
      from analytics.insights_daily i, jsonb_array_elements(coalesce(i.actions, '[]'::jsonb)) a
      where i.workspace_id = ${ctx.workspaceId} and i.ad_account_id = ${adAccountId}
        and i.date >= ${from} and i.date <= ${to}
      group by i.date, a->>'action_type'`),
  ]);
  const out = new Map<string, InternalDay>();
  for (const t of totals) {
    out.set(t.date, {
      spend: t.spend,
      impressions: Number(t.impressions),
      linkClicks: Number(t.linkClicks),
      conversionValue: t.conversionValue,
      resultTypes: t.resultTypes,
      actionsByType: {},
    });
  }
  for (const a of actions) {
    const d = out.get(a.date);
    if (d) d.actionsByType[a.type] = Math.round(Number(a.value));
  }
  return out;
}

export type ReconcileOutcome =
  { status: 'ok' | 'warning'; days: number; warningDates: string[]; maxSpendDeltaPct: string } | { status: 'expired' };

/**
 * Job `reconcile:account` (worker): so từng ngày trong [from, to] giữa AdxLens và Meta cấp tài khoản
 * (cùng cửa sổ attribution). Lệch → sự cố P2 + playbook `reconcile_retry` (đồng bộ lại sau 24 giờ,
 * 1 lần/ngày/tài khoản; vượt thì leo thang). Hết lệch → đóng sự cố.
 */
export async function reconcileAccount(
  ctx: WorkspaceCtx,
  input: { adAccountId: string; from: string; to: string },
  deps: ReconcileDeps,
): Promise<ReconcileOutcome> {
  const clock = deps.clock ?? systemClock;
  const [account] = await ctx.db
    .select()
    .from(adAccounts)
    .where(and(eq(adAccounts.workspaceId, ctx.workspaceId), eq(adAccounts.id, input.adAccountId)));
  if (!account) throw notFound('Tài khoản QC');

  let metaRows: MetaInsight[];
  try {
    metaRows = await withConnectionToken(ctx, account.connectionId, deps.keys, (token) =>
      deps.meta.getInsights(token, account.metaAccountId, {
        level: 'account',
        since: input.from,
        until: input.to,
        attributionWindows: DEFAULT_ATTRIBUTION,
      }),
    );
  } catch (e) {
    if (e instanceof MetaApiError && e.isTokenInvalid) {
      await markConnectionExpired(ctx, account.connectionId);
      return { status: 'expired' };
    }
    throw e;
  }
  const metaByDate = new Map(metaRows.map((r) => [r.date_start, r]));
  const internal = await internalTotals(ctx, account.id, input.from, input.to);

  const warningDates: string[] = [];
  let maxSpend = '0.000000';
  const rows: (typeof reconciliationResults.$inferInsert)[] = [];
  for (const date of eachDay(input.from, input.to)) {
    const m = metaByDate.get(date);
    const i = internal.get(date);
    if (!m && !i) continue;
    const types = i?.resultTypes ?? [];
    const byType: Record<string, { internal: number; meta: number; delta_pct: string }> = {};
    let resInt = 0;
    let resMeta = 0;
    for (const t of types) {
      const vi = i?.actionsByType[t] ?? 0;
      const vm = Math.round(Number(actionValue(m?.actions, t)));
      byType[t] = { internal: vi, meta: vm, delta_pct: deltaPct(vi, vm) };
      resInt += vi;
      resMeta += vm;
    }
    const spendInternal = i?.spend ?? '0';
    const spendMeta = m?.spend ?? '0';
    const spendDelta = deltaPct(spendInternal, spendMeta);
    // Lệch kết quả lấy loại lệch nhiều nhất, không để loại này bù loại kia.
    const resultsDelta = Object.values(byType).reduce(
      (mx, v) => (compareDecimal(v.delta_pct, mx) > 0 ? v.delta_pct : mx),
      '0.000000',
    );
    const status = statusFor(spendDelta, resultsDelta);
    if (status === 'warning') warningDates.push(date);
    if (compareDecimal(spendDelta, maxSpend) > 0) maxSpend = spendDelta;
    rows.push({
      workspaceId: ctx.workspaceId,
      adAccountId: account.id,
      date,
      spendInternal,
      spendMeta,
      resultsInternal: resInt,
      resultsMeta: resMeta,
      impressionsInternal: i?.impressions ?? 0,
      impressionsMeta: Number(m?.impressions ?? 0),
      linkClicksInternal: i?.linkClicks ?? 0,
      linkClicksMeta: Number(m?.inline_link_clicks ?? 0),
      conversionValueInternal: i?.conversionValue ?? '0',
      conversionValueMeta: sumDecimal(types.map((t) => actionValue(m?.action_values, t))),
      resultTypes: types,
      resultsByType: byType,
      spendDeltaPct: spendDelta,
      resultsDeltaPct: resultsDelta,
      status,
      checkedAt: clock.now(),
    });
  }
  if (rows.length) {
    await ctx.db
      .insert(reconciliationResults)
      .values(rows)
      .onConflictDoUpdate({
        target: [reconciliationResults.adAccountId, reconciliationResults.date],
        set: Object.fromEntries(
          [
            'spend_internal',
            'spend_meta',
            'results_internal',
            'results_meta',
            'impressions_internal',
            'impressions_meta',
            'link_clicks_internal',
            'link_clicks_meta',
            'conversion_value_internal',
            'conversion_value_meta',
            'result_types',
            'results_by_type',
            'spend_delta_pct',
            'results_delta_pct',
            'status',
            'checked_at',
          ].map((c) => [camel(c), sql.raw(`excluded.${c}`)]),
        ),
      });
  }

  const fingerprint = `reconcile:${account.id}`;
  if (warningDates.length) {
    const { incident } = await openIncident(ctx.db, {
      kind: 'reconciliation_warning',
      severity: 'P2',
      source: 'reconcile',
      title: 'Đối chiếu lệch > 1%',
      fingerprint,
      workspaceId: ctx.workspaceId,
      adAccountId: account.id,
      detail: { dates: warningDates, max_spend_delta_pct: maxSpend },
    });
    const enqueue = deps.enqueue;
    if (enqueue) {
      await runPlaybook(
        ctx.db,
        { playbook: 'reconcile_retry', scopeKey: account.id, incidentId: incident.id, workspaceId: ctx.workspaceId },
        async () => {
          const r = await startManualSync(
            ctx,
            account.id,
            { from: warningDates[0]!, to: warningDates.at(-1)! },
            { enqueue, clock, delayMs: RECONCILE_RETRY_DELAY_MS },
          );
          return { sync_run_id: r.syncRunId, dates: warningDates };
        },
        clock,
      );
    }
  } else if (rows.length) {
    await resolveIncidentsByFingerprint(ctx.db, fingerprint, clock);
  }
  // L3 7.3: đối chiếu ổn → audit. Lệch chỉ chặn khi rơi vào 14 ngày mà engine dùng để so sánh.
  const auditFloor = addDays(input.to, -(AUDIT_GUARD_DAYS - 1));
  if (rows.length && deps.enqueue && !warningDates.some((d) => d >= auditFloor)) {
    await deps.enqueue('audit:run', {
      workspaceId: ctx.workspaceId,
      adAccountId: account.id,
      snapshotVersion: clock.now().toISOString(),
    });
  }
  return {
    status: warningDates.length ? 'warning' : 'ok',
    days: rows.length,
    warningDates,
    maxSpendDeltaPct: maxSpend,
  };
}

function camel(c: string) {
  return c.replace(/_(\w)/g, (_, x: string) => x.toUpperCase());
}

export type AccountReconciliation = {
  status: 'ok' | 'warning' | 'pending';
  /** Lệch chi tiêu lớn nhất trong cửa sổ (%). */
  maxSpendDeltaPct: string | null;
  checkedAt: Date | null;
};

/** Badge "Khớp x% / Lệch x%" theo tài khoản: 7 ngày tới hôm qua theo múi giờ tài khoản. */
export async function accountReconciliation(
  ctx: WorkspaceCtx,
  adAccountIds: string[],
  clock: Clock = systemClock,
): Promise<Map<string, AccountReconciliation>> {
  const out = new Map<string, AccountReconciliation>();
  if (!adAccountIds.length) return out;
  const accounts = await ctx.db
    .select({ id: adAccounts.id, timezone: adAccounts.timezone })
    .from(adAccounts)
    .where(and(eq(adAccounts.workspaceId, ctx.workspaceId), inArray(adAccounts.id, adAccountIds)));
  for (const a of accounts) {
    const to = addDays(localDate(clock.now(), a.timezone), -1);
    const from = addDays(to, -(BADGE_WINDOW_DAYS - 1));
    const [r] = await ctx.db
      .select({
        n: sql<number>`count(*)::int`,
        warnings: sql<number>`count(*) filter (where ${reconciliationResults.status} = 'warning')::int`,
        maxSpend: sql<string | null>`max(${reconciliationResults.spendDeltaPct})::text`,
        checkedAt: sql<Date | null>`max(${reconciliationResults.checkedAt})`,
      })
      .from(reconciliationResults)
      .where(
        and(
          eq(reconciliationResults.workspaceId, ctx.workspaceId),
          eq(reconciliationResults.adAccountId, a.id),
          gte(reconciliationResults.date, from),
          lte(reconciliationResults.date, to),
        ),
      );
    out.set(a.id, {
      status: !r?.n ? 'pending' : r.warnings ? 'warning' : 'ok',
      maxSpendDeltaPct: r?.maxSpend ?? null,
      checkedAt: r?.checkedAt ? new Date(r.checkedAt) : null,
    });
  }
  return out;
}

export type MetricRow = {
  key: 'spend' | 'impressions' | 'linkClicks' | 'conversionValue' | 'roas' | `result:${string}`;
  internal: string;
  meta: string;
  diff: string;
  deltaPct: string;
  ok: boolean;
};

export type ReconciliationDetail = {
  from: string;
  to: string;
  status: 'ok' | 'warning' | 'pending';
  metrics: MetricRow[];
  warningDates: string[];
  checkedAt: Date | null;
  days: { date: string; spendDeltaPct: string; resultsDeltaPct: string; status: 'ok' | 'warning' }[];
};

function absDiff(a: string, b: string, scale = 4): string {
  const d = toScaled(a, scale) - toScaled(b, scale);
  return fromScaled(d < 0n ? -d : d, scale);
}

/** ROAS = doanh thu / chi tiêu, 4 chữ số thập phân, tính trên số nguyên đã nhân (không float). */
export function roas(value: string, spend: string): string {
  const s = toScaled(spend);
  if (s === 0n) return '0.0000';
  const v = toScaled(value);
  return fromScaled((v * 10n ** 4n * 2n + s) / (s * 2n));
}

/** D04: tổng từng chỉ số trong khoảng, AdxLens so với Ads Manager. */
export async function reconciliationDetail(
  ctx: WorkspaceCtx,
  adAccountId: string,
  range: { from: string; to: string },
): Promise<ReconciliationDetail> {
  const rows = await ctx.db
    .select()
    .from(reconciliationResults)
    .where(
      and(
        eq(reconciliationResults.workspaceId, ctx.workspaceId),
        eq(reconciliationResults.adAccountId, adAccountId),
        gte(reconciliationResults.date, range.from),
        lte(reconciliationResults.date, range.to),
      ),
    )
    .orderBy(desc(reconciliationResults.date));
  const sumStr = (k: 'spendInternal' | 'spendMeta' | 'conversionValueInternal' | 'conversionValueMeta') =>
    sumDecimal(rows.map((r) => r[k]));
  const sumNum = (k: 'impressionsInternal' | 'impressionsMeta' | 'linkClicksInternal' | 'linkClicksMeta'): string =>
    String(rows.reduce((t, r) => t + r[k], 0));
  const metric = (key: MetricRow['key'], internal: string, meta: string, scale = 4): MetricRow => {
    const pct = deltaPct(internal, meta);
    return { key, internal, meta, diff: absDiff(internal, meta, scale), deltaPct: pct, ok: withinThreshold(pct) };
  };
  const spendI = sumStr('spendInternal');
  const spendM = sumStr('spendMeta');
  const valueI = sumStr('conversionValueInternal');
  const valueM = sumStr('conversionValueMeta');
  const types = new Map<string, { internal: number; meta: number }>();
  for (const r of rows) {
    for (const [t, v] of Object.entries(r.resultsByType)) {
      const cur = types.get(t) ?? { internal: 0, meta: 0 };
      types.set(t, { internal: cur.internal + v.internal, meta: cur.meta + v.meta });
    }
  }
  const metrics: MetricRow[] = [
    metric('spend', spendI, spendM),
    metric('impressions', sumNum('impressionsInternal'), sumNum('impressionsMeta'), 0),
    metric('linkClicks', sumNum('linkClicksInternal'), sumNum('linkClicksMeta'), 0),
    ...[...types]
      .filter(([t]) => t !== 'link_click')
      .map(([t, v]) => metric(`result:${t}`, String(v.internal), String(v.meta), 0)),
  ];
  if (toScaled(valueI) > 0n || toScaled(valueM) > 0n) {
    metrics.push(metric('conversionValue', valueI, valueM));
    metrics.push(metric('roas', roas(valueI, spendI), roas(valueM, spendM)));
  }
  const warningDates = rows.filter((r) => r.status === 'warning').map((r) => r.date);
  return {
    ...range,
    status: rows.length === 0 ? 'pending' : warningDates.length ? 'warning' : 'ok',
    metrics,
    warningDates,
    checkedAt: rows.reduce<Date | null>((mx, r) => (!mx || r.checkedAt > mx ? r.checkedAt : mx), null),
    days: rows.map((r) => ({
      date: r.date,
      spendDeltaPct: r.spendDeltaPct,
      resultsDeltaPct: r.resultsDeltaPct,
      status: r.status,
    })),
  };
}
