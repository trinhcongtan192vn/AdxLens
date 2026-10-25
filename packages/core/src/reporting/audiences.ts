import { sql } from 'drizzle-orm';
import { listAdAccounts } from '@adxlens/core/connections';
import { divDecimal, sumDecimal, type ActorCtx } from '@adxlens/core/shared';
import { entityMetricValues } from './metric-catalog';

type DateRange = { from: string; to: string };
type AudienceType = 'lookalike' | 'custom' | 'interest' | 'broad';

export type AudienceRow = {
  key: string;
  name: string | null;
  type: AudienceType;
  adsets: number;
  spend: string;
  results: number;
  cpa: string | null;
  roas: string | null;
  ctr: number | null;
};

/**
 * Top Audiences (Madgicx Audience Studio): xếp hạng audience (lookalike, custom, interest, "Rộng") theo số của các nhóm
 * QC dùng audience đó trong kỳ. Nhóm QC dùng nhiều audience được tính cho MỖI audience (giao diện ghi rõ) — tổng các dòng
 * có thể lớn hơn tổng tài khoản. Chỉ tài khoản người dùng được xem; số do code tính.
 */
export async function topAudiences(
  ctx: ActorCtx,
  adAccountIds: string[],
  range: DateRange,
): Promise<{ rows: AudienceRow[]; adsetsWithoutData: number }> {
  const allowed = new Set((await listAdAccounts(ctx)).map((a) => a.id));
  const ids = adAccountIds.filter((id) => allowed.has(id));
  if (!ids.length) return { rows: [], adsetsWithoutData: 0 };
  const [adsets, metrics] = await Promise.all([
    ctx.db.execute<{
      meta_id: string;
      audiences: { key: string; name: string | null; type: AudienceType }[] | null;
    }>(sql`
      select meta_id, attrs->'audiences' as audiences from analytics.entities
      where workspace_id = ${ctx.workspaceId} and ad_account_id in ${ids} and entity_type = 'adset'`),
    entityMetricValues(ctx, ids, 'adset', range),
  ]);
  const groups = new Map<
    string,
    {
      name: string | null;
      type: AudienceType;
      spend: string[];
      value: string[];
      results: number;
      clicks: number;
      imp: number;
      n: number;
    }
  >();
  let missing = 0;
  for (const a of adsets) {
    const m = metrics.get(a.meta_id);
    if (!m || Number(m.spend ?? 0) <= 0) continue;
    if (!a.audiences?.length) {
      missing++;
      continue;
    }
    for (const au of a.audiences) {
      const g = groups.get(au.key) ?? {
        name: au.name,
        type: au.type,
        spend: [],
        value: [],
        results: 0,
        clicks: 0,
        imp: 0,
        n: 0,
      };
      g.spend.push(m.spend ?? '0');
      if (m.purchase_value) g.value.push(m.purchase_value);
      g.results += Number(m.results ?? 0);
      g.clicks += Number(m.link_clicks ?? 0);
      g.imp += Number(m.impressions ?? 0);
      g.n++;
      groups.set(au.key, g);
    }
  }
  const rows = [...groups].map(([key, g]) => {
    const spend = sumDecimal(g.spend);
    const value = sumDecimal(g.value);
    return {
      key,
      name: g.name,
      type: g.type,
      adsets: g.n,
      spend,
      results: g.results,
      cpa: g.results > 0 ? divDecimal(spend, String(g.results), 2) : null,
      roas: Number(value) > 0 && Number(spend) > 0 ? divDecimal(value, spend, 2) : null,
      ctr: g.imp > 0 ? Math.round((g.clicks / g.imp) * 10000) / 100 : null,
    };
  });
  return { rows: rows.sort((a, b) => Number(b.spend) - Number(a.spend)), adsetsWithoutData: missing };
}
