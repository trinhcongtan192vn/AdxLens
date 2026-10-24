import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import { listAdAccounts } from '@adxlens/core/connections';
import { AppError, divDecimal, type ActorCtx } from '@adxlens/core/shared';
import { explainCpaChange, type CpaChange } from './cpa-change';
import { toKpis, type DateRange, type EntityRow, type Kpis } from './metrics';
import type { BreakdownRow } from './report-extras';

const { entities, findings, actions } = schema;

export type EntityLevel = 'campaign' | 'adset' | 'ad';
export const CHILD_LEVEL: Record<EntityLevel, EntityLevel | null> = { campaign: 'adset', adset: 'ad', ad: null };
/** Cột của insights_daily (dòng cấp ad) dùng để gom theo từng cấp. */
const KEY_COL: Record<EntityLevel, string> = { campaign: 'campaign_id', adset: 'adset_id', ad: 'meta_id' };

type RawSums = {
  spend: string;
  impressions: string;
  reach: string;
  clicks: string;
  link_clicks: string;
  results: string;
  conversion_value: string;
  result_types: string[] | null;
};
const SUMS = sql`coalesce(sum(spend), 0)::text as spend, coalesce(sum(impressions), 0)::text as impressions,
  coalesce(sum(reach), 0)::text as reach, coalesce(sum(clicks), 0)::text as clicks,
  coalesce(sum(link_clicks), 0)::text as link_clicks, coalesce(sum(results), 0)::text as results,
  coalesce(sum(conversion_value), 0)::text as conversion_value,
  array_agg(distinct result_type) filter (where result_type is not null) as result_types`;

async function account(ctx: ActorCtx, adAccountId: string) {
  const a = (await listAdAccounts(ctx)).find((x) => x.id === adAccountId);
  if (!a) throw new AppError('NOT_FOUND', 'Không tìm thấy tài khoản');
  return a;
}

/** Thông tin một chiến dịch / nhóm QC / quảng cáo + chuỗi cha (để dựng đường dẫn phạm vi). */
export async function entityInfo(ctx: ActorCtx, adAccountId: string, level: EntityLevel, metaId: string) {
  const acc = await account(ctx, adAccountId);
  const get = async (type: EntityLevel, id: string | null) => {
    if (!id) return null;
    const [e] = await ctx.db
      .select()
      .from(entities)
      .where(
        and(
          eq(entities.workspaceId, ctx.workspaceId),
          eq(entities.adAccountId, acc.id),
          eq(entities.entityType, type),
          eq(entities.metaId, id),
        ),
      );
    return e ?? null;
  };
  const self = await get(level, metaId);
  if (!self) throw new AppError('NOT_FOUND', 'Không tìm thấy đối tượng');
  const adset = level === 'ad' ? await get('adset', self.parentMetaId) : level === 'adset' ? self : null;
  const campaign =
    level === 'campaign'
      ? self
      : await get('campaign', level === 'adset' ? self.parentMetaId : (adset?.parentMetaId ?? null));
  return {
    account: {
      metaAccountId: acc.metaAccountId,
      id: acc.id,
      name: acc.name,
      currency: acc.currency,
      timezone: acc.timezone,
      clientId: acc.clientId,
      clientName: acc.clientName,
    },
    level,
    metaId,
    name: self.name,
    status: self.status,
    dailyBudget: self.dailyBudget,
    objective: self.objective,
    learningStage: self.learningStage,
    campaign: campaign && level !== 'campaign' ? { metaId: campaign.metaId, name: campaign.name } : null,
    adset: adset && level === 'ad' ? { metaId: adset.metaId, name: adset.name } : null,
  };
}

/** Id con cháu (nhóm QC và quảng cáo) của một chiến dịch / nhóm QC, gồm chính nó. */
export async function descendantIds(ctx: ActorCtx, adAccountId: string, level: EntityLevel, metaId: string) {
  const ids = [metaId];
  let parents = [metaId];
  for (let l = CHILD_LEVEL[level]; l && parents.length; l = CHILD_LEVEL[l]) {
    const rows = await ctx.db
      .select({ id: entities.metaId })
      .from(entities)
      .where(
        and(
          eq(entities.workspaceId, ctx.workspaceId),
          eq(entities.adAccountId, adAccountId),
          eq(entities.entityType, l),
          inArray(entities.parentMetaId, parents),
        ),
      );
    parents = rows.map((r) => r.id);
    ids.push(...parents);
  }
  return ids;
}

/** KPI của riêng một đối tượng trong kỳ. */
export async function entityKpis(
  ctx: ActorCtx,
  adAccountId: string,
  level: EntityLevel,
  metaId: string,
  range: DateRange,
): Promise<Kpis> {
  await account(ctx, adAccountId);
  const [r] = await ctx.db.execute<RawSums>(sql`
    select ${SUMS} from analytics.insights_daily
    where workspace_id = ${ctx.workspaceId} and ad_account_id = ${adAccountId}
      and ${sql.raw(KEY_COL[level])} = ${metaId} and date between ${range.from} and ${range.to}`);
  return toKpis(r);
}

/** Chuỗi theo ngày của một đối tượng (ngày không có dữ liệu = 0). */
export async function entityDaily(
  ctx: ActorCtx,
  adAccountId: string,
  level: EntityLevel,
  metaId: string,
  range: DateRange,
) {
  await account(ctx, adAccountId);
  const rows = await ctx.db.execute<RawSums & { date: string }>(sql`
    select d::date::text as date, ${SUMS}
    from generate_series(${range.from}::date, ${range.to}::date, interval '1 day') d
    left join analytics.insights_daily i on i.date = d::date and i.workspace_id = ${ctx.workspaceId}
      and i.ad_account_id = ${adAccountId} and i.${sql.raw(KEY_COL[level])} = ${metaId}
    group by d order by d`);
  return rows.map((r) => ({ date: r.date, ...toKpis(r) }));
}

/** Con trực tiếp (nhóm QC của chiến dịch / quảng cáo của nhóm QC) với KPI trong kỳ, xếp theo chi tiêu. */
export async function childRows(
  ctx: ActorCtx,
  adAccountId: string,
  level: EntityLevel,
  metaId: string,
  range: DateRange,
): Promise<EntityRow[]> {
  const child = CHILD_LEVEL[level];
  if (!child) return [];
  await account(ctx, adAccountId);
  const key = sql.raw(KEY_COL[child]);
  const rows = await ctx.db.execute<
    RawSums & { meta_id: string; name: string | null; status: string | null; daily_budget: string | null }
  >(sql`
    with m as (
      select ${key} as key, ${SUMS} from analytics.insights_daily
      where workspace_id = ${ctx.workspaceId} and ad_account_id = ${adAccountId}
        and date between ${range.from} and ${range.to} and ${key} is not null
      group by ${key}
    )
    select e.meta_id, e.name, e.status, e.daily_budget::text as daily_budget, m.spend, m.impressions, m.reach, m.clicks, m.link_clicks, m.results,
      m.conversion_value, m.result_types
    from analytics.entities e
    left join m on m.key = e.meta_id
    where e.workspace_id = ${ctx.workspaceId} and e.ad_account_id = ${adAccountId} and e.entity_type = ${child}
      and e.parent_meta_id = ${metaId}
    order by coalesce(m.spend::numeric, 0) desc, e.name`);
  return rows.map((r) => ({
    adAccountId,
    metaId: r.meta_id,
    name: r.name,
    status: r.status,
    parentMetaId: metaId,
    dailyBudget: r.daily_budget,
    kpis: toKpis(r.spend === null ? undefined : r),
  }));
}

/** "Vì sao CPA thay đổi" cho một chiến dịch / nhóm QC: yếu tố + con đóng góp nhiều nhất (A1 ở cấp đối tượng). */
export async function entityCpaChange(
  ctx: ActorCtx,
  adAccountId: string,
  level: EntityLevel,
  metaId: string,
  cur: DateRange,
  prev: DateRange,
): Promise<CpaChange | null> {
  const [kc, kp, cc, cp] = await Promise.all([
    entityKpis(ctx, adAccountId, level, metaId, cur),
    entityKpis(ctx, adAccountId, level, metaId, prev),
    childRows(ctx, adAccountId, level, metaId, cur),
    childRows(ctx, adAccountId, level, metaId, prev),
  ]);
  return explainCpaChange(kc, kp, { current: cc, previous: cp });
}

/**
 * Theo nhóm (tuổi-giới tính / vị trí / khu vực) cho một đối tượng: dữ liệu nhóm lưu ở cấp nhóm QC, nên chiến dịch =
 * mọi nhóm QC của nó; quảng cáo = nhóm QC chứa nó (`scope: 'adset'`).
 */
export async function entityBreakdown(
  ctx: ActorCtx,
  adAccountId: string,
  level: EntityLevel,
  metaId: string,
  range: DateRange,
  breakdown: 'age_gender' | 'placement' | 'region',
  limit = 8,
): Promise<{ scope: 'self' | 'adset'; rows: BreakdownRow[] }> {
  const info = await entityInfo(ctx, adAccountId, level, metaId);
  const adsetIds =
    level === 'campaign'
      ? (await descendantIds(ctx, adAccountId, 'campaign', metaId)).slice(1)
      : level === 'adset'
        ? [metaId]
        : info.adset
          ? [info.adset.metaId]
          : [];
  if (!adsetIds.length) return { scope: level === 'ad' ? 'adset' : 'self', rows: [] };
  const rows = await ctx.db.execute<{
    key: string;
    spend: string;
    results: string;
    link_clicks: string;
    impressions: string;
  }>(sql`
    select key, sum(spend)::text as spend, sum(results)::text as results, sum(link_clicks)::text as link_clicks,
      sum(impressions)::text as impressions
    from analytics.insights_breakdowns
    where workspace_id = ${ctx.workspaceId} and ad_account_id = ${adAccountId} and breakdown = ${breakdown}
      and adset_id in ${adsetIds} and date between ${range.from} and ${range.to}
    group by key order by sum(spend) desc`);
  const total = rows.reduce((s, r) => s + Number(r.spend), 0);
  return {
    scope: level === 'ad' ? 'adset' : 'self',
    rows: rows.slice(0, limit).map((r) => {
      const results = Number(r.results);
      const impressions = Number(r.impressions);
      return {
        key: r.key,
        spend: r.spend,
        results,
        cpa: results > 0 ? divDecimal(r.spend, String(results), 2) : null,
        ctr: impressions > 0 ? Math.round((Number(r.link_clicks) / impressions) * 10000) / 10000 : null,
        share: total > 0 ? Math.round((Number(r.spend) / total) * 1000) / 10 : 0,
      };
    }),
  };
}

/** Phát hiện đang mở của đối tượng và con cháu của nó. */
export async function entityFindings(ctx: ActorCtx, adAccountId: string, level: EntityLevel, metaId: string) {
  await account(ctx, adAccountId);
  const ids = await descendantIds(ctx, adAccountId, level, metaId);
  return ctx.db
    .select({
      id: findings.id,
      ruleId: findings.ruleId,
      severity: findings.severity,
      entityType: findings.entityType,
      entityName: findings.entityName,
      explanation: findings.explanation,
      impactEstimate: findings.impactEstimate,
    })
    .from(findings)
    .where(
      and(
        eq(findings.workspaceId, ctx.workspaceId),
        eq(findings.adAccountId, adAccountId),
        inArray(findings.metaId, ids),
        inArray(findings.status, ['new', 'seen']),
      ),
    )
    .orderBy(sql`case ${findings.severity} when 'high' then 0 when 'medium' then 1 else 2 end`)
    .limit(20);
}

/** Lịch sử thay đổi qua AdxLens (Execution Gateway) trên đối tượng và con cháu. */
export async function entityHistory(ctx: ActorCtx, adAccountId: string, level: EntityLevel, metaId: string) {
  await account(ctx, adAccountId);
  const ids = await descendantIds(ctx, adAccountId, level, metaId);
  return ctx.db
    .select({
      id: actions.id,
      actionType: actions.actionType,
      targetName: actions.targetName,
      tier: actions.tier,
      status: actions.status,
      beforeState: actions.beforeState,
      afterExpected: actions.afterExpected,
      createdAt: actions.createdAt,
    })
    .from(actions)
    .where(
      and(
        eq(actions.workspaceId, ctx.workspaceId),
        eq(actions.adAccountId, adAccountId),
        inArray(actions.targetMetaId, ids),
      ),
    )
    .orderBy(desc(actions.createdAt))
    .limit(30);
}
