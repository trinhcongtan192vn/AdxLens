import { sql } from 'drizzle-orm';
import { listAdAccounts } from '@adxlens/core/connections';
import { divDecimal, type ActorCtx } from '@adxlens/core/shared';

export type DateRange = { from: string; to: string };

/**
 * Chỉ số tổng của một nhóm dòng insight. Tiền là chuỗi numeric; CPA/ROAS/CPM tính bằng phép chia thập
 * phân (không float). CTR là tỷ lệ hiển thị (number) — không phải tiền.
 */
export type Kpis = {
  spend: string;
  impressions: number;
  reach: number;
  clicks: number;
  linkClicks: number;
  results: number;
  conversionValue: string;
  ctr: number | null;
  cpa: string | null;
  roas: string | null;
  cpm: string | null;
  resultTypes: string[];
};

type Raw = {
  spend: string;
  impressions: string;
  reach: string;
  clicks: string;
  link_clicks: string;
  results: string;
  conversion_value: string;
  result_types: string[] | null;
};

export function toKpis(r: Raw | undefined): Kpis {
  const spend = r?.spend ?? '0';
  const impressions = Number(r?.impressions ?? 0);
  const linkClicks = Number(r?.link_clicks ?? 0);
  const results = Number(r?.results ?? 0);
  const value = r?.conversion_value ?? '0';
  return {
    spend,
    impressions,
    reach: Number(r?.reach ?? 0),
    clicks: Number(r?.clicks ?? 0),
    linkClicks,
    results,
    conversionValue: value,
    ctr: impressions > 0 ? linkClicks / impressions : null,
    cpa: results > 0 ? divDecimal(spend, String(results)) : null,
    roas: Number(value) > 0 ? divDecimal(value, spend, 2) : null,
    cpm: impressions > 0 ? divDecimal(spend, String(impressions / 1000), 2) : null,
    resultTypes: r?.result_types ?? [],
  };
}

const SUMS = sql`sum(spend)::text as spend, sum(impressions)::text as impressions, sum(reach)::text as reach,
  sum(clicks)::text as clicks, sum(link_clicks)::text as link_clicks, sum(results)::text as results,
  coalesce(sum(conversion_value), 0)::text as conversion_value,
  array_agg(distinct result_type) filter (where result_type is not null) as result_types`;

/** Tài khoản actor được xem (buyer chỉ thấy Client được gán) trong danh sách yêu cầu. */
async function visible(ctx: ActorCtx, ids: string[]) {
  const allowed = new Map((await listAdAccounts(ctx)).map((a) => [a.id, a]));
  return ids.filter((id) => allowed.has(id));
}

/** KPI theo tài khoản trong khoảng ngày (ngày theo múi giờ từng tài khoản). */
export async function accountKpis(ctx: ActorCtx, adAccountIds: string[], range: DateRange): Promise<Map<string, Kpis>> {
  const ids = await visible(ctx, adAccountIds);
  const out = new Map<string, Kpis>(ids.map((id) => [id, toKpis(undefined)]));
  if (!ids.length) return out;
  const rows = await ctx.db.execute<Raw & { ad_account_id: string }>(sql`
    select ad_account_id, ${SUMS} from analytics.insights_daily
    where workspace_id = ${ctx.workspaceId} and ad_account_id in ${ids}
      and date between ${range.from} and ${range.to}
    group by ad_account_id`);
  for (const r of rows) out.set(r.ad_account_id, toKpis(r));
  return out;
}

/** Chuỗi theo ngày của một hoặc nhiều tài khoản (D01 xu hướng, báo cáo). Ngày không có dữ liệu = 0. */
export async function dailySeries(ctx: ActorCtx, adAccountIds: string[], range: DateRange) {
  const ids = await visible(ctx, adAccountIds);
  if (!ids.length) return [];
  const rows = await ctx.db.execute<Raw & { date: string }>(sql`
    select d::date::text as date, ${SUMS}
    from generate_series(${range.from}::date, ${range.to}::date, interval '1 day') d
    left join analytics.insights_daily i
      on i.date = d::date and i.workspace_id = ${ctx.workspaceId} and i.ad_account_id in ${ids}
    group by d order by d`);
  return rows.map((r) => ({ date: r.date, ...toKpis({ ...r, spend: r.spend ?? '0' }) }));
}

export type EntityRow = {
  adAccountId: string;
  metaId: string;
  name: string | null;
  status: string | null;
  parentMetaId: string | null;
  /** Ngân sách ngày (nhóm QC dùng ngân sách ngày), chuỗi decimal theo tiền tệ tài khoản. */
  dailyBudget?: string | null;
  kpis: Kpis;
};

/** Bảng theo cấp (C02 tab Chiến dịch / Nhóm QC / Quảng cáo) trong khoảng ngày. */
export async function entityTable(
  ctx: ActorCtx,
  adAccountIds: string[],
  level: 'campaign' | 'adset' | 'ad',
  range: DateRange,
): Promise<EntityRow[]> {
  const ids = await visible(ctx, adAccountIds);
  if (!ids.length) return [];
  const key = sql.raw(level === 'ad' ? 'meta_id' : level === 'adset' ? 'adset_id' : 'campaign_id');
  const rows = await ctx.db.execute<
    Raw & {
      ad_account_id: string;
      meta_id: string;
      name: string | null;
      status: string | null;
      parent: string | null;
      daily_budget: string | null;
    }
  >(sql`
    with m as (
      select ad_account_id, ${key} as key, ${SUMS} from analytics.insights_daily
      where workspace_id = ${ctx.workspaceId} and ad_account_id in ${ids}
        and date between ${range.from} and ${range.to} and ${key} is not null
      group by ad_account_id, ${key}
    )
    select e.ad_account_id, e.meta_id, e.name, e.status, e.parent_meta_id as parent, e.daily_budget::text as daily_budget,
      m.spend, m.impressions,
      m.reach, m.clicks, m.link_clicks, m.results, m.conversion_value, m.result_types
    from analytics.entities e
    left join m on m.ad_account_id = e.ad_account_id and m.key = e.meta_id
    where e.workspace_id = ${ctx.workspaceId} and e.ad_account_id in ${ids} and e.entity_type = ${level}
    order by coalesce(m.spend::numeric, 0) desc, e.name`);
  return rows.map((r) => ({
    adAccountId: r.ad_account_id,
    metaId: r.meta_id,
    name: r.name,
    status: r.status,
    parentMetaId: r.parent,
    dailyBudget: r.daily_budget,
    kpis: toKpis(r.spend === null ? undefined : r),
  }));
}
