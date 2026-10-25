import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import { listAdAccounts } from '@adxlens/core/connections';
import {
  addDays,
  compareDecimal,
  deltaPct,
  divDecimal,
  localDate,
  systemClock,
  type ActorCtx,
  type Clock,
} from '@adxlens/core/shared';

const { recommendations } = schema;

/** Cửa sổ đo trước/sau (ngày) quanh ngày đánh dấu "Đã làm" (P1-08). */
export const OUTCOME_WINDOW_DAYS = 7;

export type OutcomeMetric = 'cpa' | 'ctr' | 'results' | 'spend';

/** Chỉ số chính và phạm vi đo theo loại gợi ý (minh bạch, `docs/rules/weekly-actions.md`). */
export const OUTCOME_METRIC: Record<string, { metric: OutcomeMetric; scope: 'entity' | 'account' } | null> = {
  creative_fatigue: { metric: 'ctr', scope: 'entity' },
  budget_misallocation: { metric: 'cpa', scope: 'account' },
  starved_winner: { metric: 'results', scope: 'entity' },
  fragmentation: { metric: 'cpa', scope: 'account' },
  learning_limited: { metric: 'results', scope: 'entity' },
  spend_no_conversion: { metric: 'cpa', scope: 'account' },
  conversion_tracking: { metric: 'results', scope: 'account' },
  creative_loser: { metric: 'cpa', scope: 'account' },
  creative_winner: { metric: 'results', scope: 'entity' },
  account_hygiene: null,
};

/** Hướng tốt của chỉ số: CPA giảm là tốt; CTR, kết quả tăng là tốt. */
export const HIGHER_IS_BETTER: Record<OutcomeMetric, boolean> = { cpa: false, ctr: true, results: true, spend: false };

type WindowMetrics = { spend: string; impressions: number; linkClicks: number; results: number };

export type Outcome = {
  id: string;
  sourceKey: string;
  entityName: string | null;
  adAccountId: string;
  accountName: string;
  currency: string;
  doneDate: string;
  metric: OutcomeMetric | null;
  scope: 'entity' | 'account' | null;
  /** `waiting`: chưa đủ ngày sau; `not_measured`: loại gợi ý không có chỉ số đo. */
  state: 'ready' | 'waiting' | 'not_measured';
  readyOn: string;
  before: string | number | null;
  after: string | number | null;
  /** % thay đổi (sau so trước), null khi không tính được. */
  changePct: string | null;
  improved: boolean | null;
};

/** % thay đổi có dấu (sau so trước), thập phân; trước = 0 → không tính. */
export function signedChangePct(before: string | number, after: string | number): string | null {
  const b = typeof before === 'number' ? before.toFixed(10) : before;
  const a = typeof after === 'number' ? after.toFixed(10) : after;
  if (compareDecimal(b, '0') === 0) return null;
  const mag = deltaPct(a, b);
  return compareDecimal(a, b) < 0 ? `-${mag}` : mag;
}

function valueOf(m: WindowMetrics, metric: OutcomeMetric): string | number | null {
  if (metric === 'spend') return m.spend;
  if (metric === 'results') return m.results;
  if (metric === 'ctr') return m.impressions > 0 ? m.linkClicks / m.impressions : null;
  return m.results > 0 ? divDecimal(m.spend, String(m.results)) : null;
}

async function windowMetrics(
  ctx: ActorCtx,
  adAccountId: string,
  scope: { entityType: string; metaId: string } | null,
  from: string,
  to: string,
): Promise<WindowMetrics> {
  let filter = sql``;
  if (scope?.entityType === 'ad') filter = sql`and i.meta_id = ${scope.metaId}`;
  else if (scope?.entityType === 'adset') filter = sql`and i.adset_id = ${scope.metaId}`;
  else if (scope?.entityType === 'campaign') filter = sql`and i.campaign_id = ${scope.metaId}`;
  else if (scope?.entityType === 'creative') {
    filter = sql`and i.meta_id in (select e.meta_id from analytics.entities e where e.workspace_id = ${ctx.workspaceId}
      and e.ad_account_id = ${adAccountId} and e.entity_type = 'ad' and e.attrs->>'creative_id' = ${scope.metaId})`;
  }
  const [r] = await ctx.db.execute<{
    spend: string | null;
    impressions: string | null;
    link_clicks: string | null;
    results: string | null;
  }>(sql`
    select sum(i.spend)::text as spend, sum(i.impressions)::text as impressions, sum(i.link_clicks)::text as link_clicks,
      sum(i.results)::text as results
    from analytics.insights_daily i
    where i.workspace_id = ${ctx.workspaceId} and i.ad_account_id = ${adAccountId} and i.entity_type = 'ad'
      and i.date between ${from} and ${to} ${filter}`);
  return {
    spend: r?.spend ?? '0',
    impressions: Number(r?.impressions ?? 0),
    linkClicks: Number(r?.link_clicks ?? 0),
    results: Number(r?.results ?? 0),
  };
}

/**
 * P105 Kết quả trước/sau (P1-08): với việc "Đã làm", so chỉ số chính 7 ngày trước ngày làm với 7 ngày sau
 * (ngày theo múi giờ tài khoản, bỏ chính ngày làm). Chưa đủ 7 ngày sau → `waiting`. Đây là so sánh trước
 * /sau, **không chứng minh quan hệ nhân quả** (mùa vụ, ngân sách, thay đổi khác cũng ảnh hưởng).
 */
export async function listOutcomes(ctx: ActorCtx, opts: { clock?: Clock; limit?: number } = {}): Promise<Outcome[]> {
  const now = (opts.clock ?? systemClock).now();
  const accounts = await listAdAccounts(ctx);
  const byId = new Map(accounts.map((a) => [a.id, a]));
  if (!accounts.length) return [];
  const rows = await ctx.db
    .select()
    .from(recommendations)
    .where(
      and(
        eq(recommendations.workspaceId, ctx.workspaceId),
        eq(recommendations.status, 'done'),
        isNotNull(recommendations.doneAt),
        inArray(recommendations.adAccountId, [...byId.keys()]),
      ),
    )
    .orderBy(desc(recommendations.doneAt))
    .limit(opts.limit ?? 50);
  const out: Outcome[] = [];
  for (const r of rows) {
    const a = byId.get(r.adAccountId)!;
    const doneDate = localDate(r.doneAt!, a.timezone);
    const readyOn = addDays(doneDate, OUTCOME_WINDOW_DAYS + 1);
    const conf = OUTCOME_METRIC[r.sourceKey] ?? null;
    const base = {
      id: r.id,
      sourceKey: r.sourceKey,
      entityName: r.entityName ?? r.metaId,
      adAccountId: a.id,
      accountName: a.name,
      currency: a.currency,
      doneDate,
      metric: conf?.metric ?? null,
      scope: conf?.scope ?? null,
      readyOn,
      before: null,
      after: null,
      changePct: null,
      improved: null,
    };
    if (!conf) {
      out.push({ ...base, state: 'not_measured' });
      continue;
    }
    if (localDate(now, a.timezone) < readyOn) {
      out.push({ ...base, state: 'waiting' });
      continue;
    }
    const scope = conf.scope === 'entity' ? { entityType: r.entityType, metaId: r.metaId } : null;
    const [b, af] = await Promise.all([
      windowMetrics(ctx, a.id, scope, addDays(doneDate, -OUTCOME_WINDOW_DAYS), addDays(doneDate, -1)),
      windowMetrics(ctx, a.id, scope, addDays(doneDate, 1), addDays(doneDate, OUTCOME_WINDOW_DAYS)),
    ]);
    const before = valueOf(b, conf.metric);
    const after = valueOf(af, conf.metric);
    const changePct = before !== null && after !== null ? signedChangePct(before, after) : null;
    out.push({
      ...base,
      state: 'ready',
      before,
      after,
      changePct,
      improved:
        changePct === null || Number(changePct) === 0 ? null : Number(changePct) > 0 === HIGHER_IS_BETTER[conf.metric],
    });
  }
  return out;
}
