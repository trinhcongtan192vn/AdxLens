import { sql } from 'drizzle-orm';
import type { DbOrTx } from '@adxlens/db';
import { divDecimal, type ActorCtx } from '@adxlens/core/shared';
import { listAdAccounts } from '@adxlens/core/connections';
import type { DateRange } from './metrics';

export const BREAKDOWN_ROWS_LIMIT = 8;
export const TOP_ADS_LIMIT = 5;

export type BreakdownRow = {
  key: string;
  spend: string;
  results: number;
  cpa: string | null;
  ctr: number | null;
  share: number;
};
export type TopAd = {
  metaId: string;
  name: string | null;
  thumbnailUrl: string | null;
  spend: string;
  results: number;
  cpa: string | null;
  ctr: number | null;
};

async function visible(ctx: ActorCtx, ids: string[]) {
  const allowed = new Set((await listAdAccounts(ctx)).map((a) => a.id));
  return ids.filter((id) => allowed.has(id));
}

const ctrOf = (clicks: number, impressions: number) =>
  impressions > 0 ? Math.round((clicks / impressions) * 10000) / 10000 : null;

/**
 * Bảng theo nhóm cho báo cáo (A4): top nhóm theo chi tiêu trong kỳ, CPA = chi / kết quả (decimal), CTR, tỷ trọng chi
 * tiêu. Dữ liệu từ `analytics.insights_breakdowns` của các tài khoản được xem.
 */
export async function breakdownTable(
  ctx: ActorCtx,
  adAccountIds: string[],
  range: DateRange,
  breakdown: 'age_gender' | 'placement' | 'region' | 'country',
  limit = BREAKDOWN_ROWS_LIMIT,
): Promise<BreakdownRow[]> {
  const ids = await visible(ctx, adAccountIds);
  if (!ids.length) return [];
  const db: DbOrTx = ctx.db;
  const rows = await db.execute<{
    key: string;
    spend: string;
    results: string;
    link_clicks: string;
    impressions: string;
  }>(sql`
    select key, sum(spend)::text as spend, sum(results)::text as results, sum(link_clicks)::text as link_clicks,
      sum(impressions)::text as impressions
    from analytics.insights_breakdowns
    where workspace_id = ${ctx.workspaceId} and ad_account_id in ${ids} and breakdown = ${breakdown}
      and date between ${range.from} and ${range.to}
    group by key
    order by sum(spend) desc`);
  const total = rows.reduce((s, r) => s + Number(r.spend), 0);
  return rows.slice(0, limit).map((r) => {
    const results = Number(r.results);
    return {
      key: r.key,
      spend: r.spend,
      results,
      cpa: results > 0 ? divDecimal(r.spend, String(results), 2) : null,
      ctr: ctrOf(Number(r.link_clicks), Number(r.impressions)),
      share: total > 0 ? Math.round((Number(r.spend) / total) * 1000) / 10 : 0,
    };
  });
}

/** Top quảng cáo theo chi tiêu trong kỳ kèm ảnh thumbnail của creative (A4). */
export async function topAds(
  ctx: ActorCtx,
  adAccountIds: string[],
  range: DateRange,
  limit = TOP_ADS_LIMIT,
): Promise<TopAd[]> {
  const ids = await visible(ctx, adAccountIds);
  if (!ids.length) return [];
  const rows = await ctx.db.execute<{
    meta_id: string;
    name: string | null;
    thumbnail_url: string | null;
    spend: string;
    results: string;
    link_clicks: string;
    impressions: string;
  }>(sql`
    with m as (
      select ad_account_id, meta_id, sum(spend) as spend, sum(results) as results, sum(link_clicks) as link_clicks,
        sum(impressions) as impressions
      from analytics.insights_daily
      where workspace_id = ${ctx.workspaceId} and ad_account_id in ${ids} and entity_type = 'ad'
        and date between ${range.from} and ${range.to}
      group by ad_account_id, meta_id
      having sum(spend) > 0
    )
    select m.meta_id, ad.name, cr.attrs->>'thumbnail_url' as thumbnail_url, m.spend::text, m.results::text,
      m.link_clicks::text, m.impressions::text
    from m
    left join analytics.entities ad on ad.workspace_id = ${ctx.workspaceId} and ad.ad_account_id = m.ad_account_id
      and ad.entity_type = 'ad' and ad.meta_id = m.meta_id
    left join analytics.entities cr on cr.workspace_id = ${ctx.workspaceId} and cr.ad_account_id = m.ad_account_id
      and cr.entity_type = 'creative' and cr.meta_id = ad.attrs->>'creative_id'
    order by m.spend desc
    limit ${limit}`);
  return rows.map((r) => {
    const results = Number(r.results);
    return {
      metaId: r.meta_id,
      name: r.name,
      thumbnailUrl: r.thumbnail_url && /^https:\/\//.test(r.thumbnail_url) ? r.thumbnail_url : null,
      spend: r.spend,
      results,
      cpa: results > 0 ? divDecimal(r.spend, String(results), 2) : null,
      ctr: ctrOf(Number(r.link_clicks), Number(r.impressions)),
    };
  });
}
