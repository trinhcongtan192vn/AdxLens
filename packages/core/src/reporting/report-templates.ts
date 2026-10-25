import { divDecimal } from '@adxlens/core/shared';
import type { Kpis } from './metrics';

/**
 * Mẫu báo cáo theo ngành (Madgicx One-Click Report: E-commerce Meta / Lead gen). Mẫu chỉ đổi bộ KPI và nhãn hiển thị;
 * số vẫn là số đã dựng trong báo cáo (không tính lại từ nguồn khác).
 */
export const REPORT_TEMPLATES = ['general', 'ecommerce', 'leadgen'] as const;
export type ReportTemplate = (typeof REPORT_TEMPLATES)[number];

export type TemplateKpiKey =
  'spend' | 'results' | 'cpa' | 'roas' | 'ctr' | 'impressions' | 'conversionValue' | 'aov' | 'cpm';

const SETS: Record<ReportTemplate, TemplateKpiKey[]> = {
  general: ['spend', 'results', 'cpa', 'roas', 'ctr', 'impressions'],
  ecommerce: ['spend', 'conversionValue', 'roas', 'results', 'cpa', 'aov'],
  leadgen: ['spend', 'results', 'cpa', 'ctr', 'cpm', 'impressions'],
};

/** Giá trị đơn trung bình = doanh thu Meta / số kết quả (mua); không có kết quả → null. */
function aov(k: Kpis): string | null {
  return k.results > 0 && Number(k.conversionValue) > 0 ? divDecimal(k.conversionValue, String(k.results), 2) : null;
}

export function templateKpis(
  template: ReportTemplate | undefined,
  cur: Kpis,
  prev: Kpis,
): { key: TemplateKpiKey; cur: string | number | null; prev: string | number | null }[] {
  const pick = (k: Kpis, key: TemplateKpiKey): string | number | null => (key === 'aov' ? aov(k) : k[key]);
  return SETS[template ?? 'general'].map((key) => ({ key, cur: pick(cur, key), prev: pick(prev, key) }));
}

/** Gợi ý mẫu theo mục tiêu chính của Client (ADR-0017). */
export function suggestReportTemplate(primaryMetric: string | null | undefined): ReportTemplate {
  if (!primaryMetric) return 'general';
  if (['roas', 'purchases', 'cost_per_purchase', 'purchase_value'].includes(primaryMetric)) return 'ecommerce';
  if (['leads', 'cpl'].includes(primaryMetric)) return 'leadgen';
  return 'general';
}
