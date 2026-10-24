import { sql } from 'drizzle-orm';
import { listAdAccounts } from '@adxlens/core/connections';
import type { ActorCtx } from '@adxlens/core/shared';

export type LatestChange = {
  actionType: string;
  status: string;
  at: Date;
  /** Đối tượng con được đổi (khi xem ở cấp cha: chiến dịch ← nhóm QC / quảng cáo). */
  targetName: string | null;
};

/**
 * Cột "Thay đổi gần nhất" (Madgicx Ads Manager 2.0 "Latest actions"): hành động gần nhất qua AdxLens trên đối tượng
 * hoặc đối tượng con của nó. Chỉ ĐỌC bảng `actions` + `entities`, theo workspace. Không gồm thay đổi làm trực tiếp
 * trong Ads Manager (AdxLens chưa đọc activity log của Meta).
 */
export async function latestEntityChanges(
  ctx: ActorCtx,
  adAccountIds: string[],
  level: 'campaign' | 'adset' | 'ad',
): Promise<Map<string, LatestChange>> {
  const allowed = new Set((await listAdAccounts(ctx)).map((a) => a.id));
  const ids = adAccountIds.filter((id) => allowed.has(id));
  const out = new Map<string, LatestChange>();
  if (!ids.length) return out;
  const key = sql.raw(level === 'ad' ? 'ad_id' : level === 'adset' ? 'adset_id' : 'campaign_id');
  const rows = await ctx.db.execute<{
    ad_account_id: string;
    key: string | null;
    action_type: string;
    status: string;
    at: string;
    target_name: string | null;
  }>(sql`
    with a as (
      select ac.ad_account_id, ac.action_type, ac.status, ac.target_name,
        coalesce(ac.executed_at, ac.created_at) as at,
        case when ac.target_type = 'ad' then ac.target_meta_id end as ad_id,
        case when ac.target_type = 'adset' then ac.target_meta_id else ad.parent_meta_id end as adset_id,
        case when ac.target_type = 'adset' then aset.parent_meta_id else ad.attrs->>'campaign_id' end as campaign_id
      from app.actions ac
      left join analytics.entities ad
        on ac.target_type = 'ad' and ad.workspace_id = ac.workspace_id and ad.ad_account_id = ac.ad_account_id
        and ad.entity_type = 'ad' and ad.meta_id = ac.target_meta_id
      left join analytics.entities aset
        on ac.target_type = 'adset' and aset.workspace_id = ac.workspace_id and aset.ad_account_id = ac.ad_account_id
        and aset.entity_type = 'adset' and aset.meta_id = ac.target_meta_id
      where ac.workspace_id = ${ctx.workspaceId} and ac.ad_account_id in ${ids} and ac.status <> 'canceled'
    )
    select distinct on (ad_account_id, ${key}) ad_account_id, ${key} as key, action_type, status, at::text as at, target_name
    from a where ${key} is not null
    order by ad_account_id, ${key}, at desc`);
  for (const r of rows) {
    if (!r.key) continue;
    out.set(`${r.ad_account_id}:${r.key}`, {
      actionType: r.action_type,
      status: r.status,
      at: new Date(r.at),
      targetName: r.target_name,
    });
  }
  return out;
}
