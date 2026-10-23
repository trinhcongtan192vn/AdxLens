import { and, eq, sql } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import { addDays, localDate, notFound, systemClock, type Clock, type WorkspaceCtx } from '@adxlens/core/shared';
import type { EntityInfo, EntitySnapshot, Metrics, Snapshot } from './types';

const { adAccounts, entities, insightsDaily } = schema;

export const WINDOW_DAYS = 7;
export const DAILY_DAYS = 28;

const EMPTY: Metrics = {
  spend: '0',
  impressions: 0,
  reach: 0,
  clicks: 0,
  linkClicks: 0,
  results: 0,
  conversionValue: '0',
  frequency: 0,
  activeDays: 0,
};

type Row = {
  key: string;
  period: 'cur' | 'prev';
  spend: string;
  impressions: string;
  reach: string;
  clicks: string;
  link_clicks: string;
  results: string;
  conversion_value: string;
  freq_weighted: string | null;
  active_days: string;
};

/** Ảnh chụp (L3 8): truy vấn tổng hợp SQL, không kéo từng dòng insight vào bộ nhớ. */
export async function loadSnapshot(
  ctx: WorkspaceCtx,
  adAccountId: string,
  clock: Clock = systemClock,
): Promise<Snapshot | null> {
  const [account] = await ctx.db
    .select()
    .from(adAccounts)
    .where(and(eq(adAccounts.workspaceId, ctx.workspaceId), eq(adAccounts.id, adAccountId)));
  if (!account) throw notFound('Tài khoản QC');
  const [v] = await ctx.db
    .select({ version: sql<Date | null>`max(${insightsDaily.fetchedAt})` })
    .from(insightsDaily)
    .where(and(eq(insightsDaily.workspaceId, ctx.workspaceId), eq(insightsDaily.adAccountId, adAccountId)));
  if (!v?.version) return null;

  const curTo = addDays(localDate(clock.now(), account.timezone), -1);
  const curFrom = addDays(curTo, -(WINDOW_DAYS - 1));
  const prevTo = addDays(curFrom, -1);
  const prevFrom = addDays(prevTo, -(WINDOW_DAYS - 1));

  const agg = async (keyCol: 'meta_id' | 'adset_id' | 'campaign_id') => {
    const rows = await ctx.db.execute<Row>(sql`
      select ${sql.raw(keyCol)} as key,
        case when date >= ${curFrom} then 'cur' else 'prev' end as period,
        sum(spend)::text as spend, sum(impressions)::text as impressions, sum(reach)::text as reach,
        sum(clicks)::text as clicks, sum(link_clicks)::text as link_clicks, sum(results)::text as results,
        coalesce(sum(conversion_value), 0)::text as conversion_value,
        (sum(frequency * impressions) / nullif(sum(impressions) filter (where frequency is not null), 0))::text as freq_weighted,
        count(distinct date) filter (where spend > 0)::text as active_days
      from analytics.insights_daily
      where workspace_id = ${ctx.workspaceId} and ad_account_id = ${adAccountId}
        and entity_type = 'ad' and date between ${prevFrom} and ${curTo} and ${sql.raw(keyCol)} is not null
      group by 1, 2`);
    const out = new Map<string, { cur: Metrics; prev: Metrics }>();
    for (const r of rows) {
      const m: Metrics = {
        spend: r.spend,
        impressions: Number(r.impressions),
        reach: Number(r.reach),
        clicks: Number(r.clicks),
        linkClicks: Number(r.link_clicks),
        results: Number(r.results),
        conversionValue: r.conversion_value,
        frequency: r.freq_weighted ? Number(r.freq_weighted) : 0,
        activeDays: Number(r.active_days),
      };
      const cur = out.get(r.key) ?? { cur: EMPTY, prev: EMPTY };
      cur[r.period] = m;
      out.set(r.key, cur);
    }
    return out;
  };

  const [adM, adsetM, campM, ents, daily] = await Promise.all([
    agg('meta_id'),
    agg('adset_id'),
    agg('campaign_id'),
    ctx.db
      .select()
      .from(entities)
      .where(and(eq(entities.workspaceId, ctx.workspaceId), eq(entities.adAccountId, adAccountId))),
    ctx.db.execute<{ date: string; spend: string; results: string; link_clicks: string }>(sql`
      select date::text as date, sum(spend)::text as spend, sum(results)::text as results,
        sum(link_clicks)::text as link_clicks
      from analytics.insights_daily
      where workspace_id = ${ctx.workspaceId} and ad_account_id = ${adAccountId}
        and date between ${addDays(curTo, -(DAILY_DAYS - 1))} and ${curTo}
      group by date order by date`),
  ]);

  const build = (type: 'campaign' | 'adset' | 'ad', metrics: Map<string, { cur: Metrics; prev: Metrics }>) =>
    ents
      .filter((e) => e.entityType === type)
      .map((e): EntitySnapshot => {
        const info: EntityInfo = {
          metaId: e.metaId,
          name: e.name,
          status: e.status,
          parentMetaId: e.parentMetaId,
          objective: e.objective,
          dailyBudget: e.dailyBudget,
          learningStage: e.learningStage,
          attrs: e.attrs,
        };
        return { ...info, ...(metrics.get(e.metaId) ?? { cur: EMPTY, prev: EMPTY }) };
      });

  return {
    account: {
      id: account.id,
      metaAccountId: account.metaAccountId,
      name: account.name,
      currency: account.currency,
      timezone: account.timezone,
    },
    version: new Date(v.version).toISOString(),
    window: { cur: { from: curFrom, to: curTo }, prev: { from: prevFrom, to: prevTo } },
    campaigns: build('campaign', campM),
    adsets: build('adset', adsetM),
    ads: build('ad', adM),
    daily: daily.map((d) => ({
      date: d.date,
      spend: d.spend,
      results: Number(d.results),
      linkClicks: Number(d.link_clicks),
    })),
    daysWithData: daily.length,
  };
}
