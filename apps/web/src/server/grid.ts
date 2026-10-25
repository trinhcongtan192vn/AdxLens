import 'server-only';
import type { EntityRow, Kpis, LatestChange } from '@adxlens/core/reporting';
import type { GridKpis, GridRow } from '@/components/entity-grid';

const pick = (k: Kpis): GridKpis => ({
  spend: k.spend,
  impressions: k.impressions,
  linkClicks: k.linkClicks,
  results: k.results,
  conversionValue: k.conversionValue,
  cpa: k.cpa,
  roas: k.roas,
  ctr: k.ctr,
});

/** Đường dẫn trang chi tiết của một chiến dịch / nhóm QC / quảng cáo (G2). */
export function entityHref(adAccountId: string, level: 'campaign' | 'adset' | 'ad', metaId: string) {
  return `/accounts/${adAccountId}/${level}/${encodeURIComponent(metaId)}`;
}

/** Dòng bảng G1 từ kết quả `entityTable` / `childRows` kỳ này + kỳ trước. */
export function toGridRows(
  level: 'campaign' | 'adset' | 'ad',
  cur: EntityRow[],
  prev: EntityRow[],
  currencyOf: Record<string, string>,
  parentNames: Map<string, string | null> = new Map(),
  /** Có truyền → hiện cột "Thay đổi gần nhất". */
  changes?: Map<string, LatestChange>,
): GridRow[] {
  const before = new Map(prev.map((r) => [`${r.adAccountId}:${r.metaId}`, r.kpis]));
  return cur.map((r) => {
    const key = `${r.adAccountId}:${r.metaId}`;
    const p = before.get(key);
    return {
      key,
      href: entityHref(r.adAccountId, level, r.metaId),
      name: r.name ?? r.metaId,
      parentName: r.parentMetaId ? (parentNames.get(`${r.adAccountId}:${r.parentMetaId}`) ?? null) : null,
      status: r.status,
      currency: currencyOf[r.adAccountId] ?? '',
      cur: pick(r.kpis),
      prev: p ? pick(p) : null,
      ...(changes
        ? {
            lastChange: changes.has(key) ? { ...changes.get(key)!, at: changes.get(key)!.at.toISOString() } : null,
          }
        : {}),
      // G4 + ADR-0015: chiến dịch, nhóm QC, quảng cáo đều có hành động trạng thái; ngân sách chỉ ở nhóm QC.
      target: {
        adAccountId: r.adAccountId,
        metaId: r.metaId,
        name: r.name ?? r.metaId,
        dailyBudget: level === 'adset' ? (r.dailyBudget ?? null) : null,
        // ADR-0025: giá thầu (nhóm QC) và giới hạn chi (chiến dịch) hiện tại.
        bidAmount: level === 'adset' ? (r.bidAmount ?? null) : null,
        spendCap: level === 'campaign' ? (r.spendCap ?? null) : null,
      },
    };
  });
}
