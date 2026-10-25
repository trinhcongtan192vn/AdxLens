export type Recon = { status: 'ok' | 'warning' | 'pending'; maxSpendDeltaPct: string | null };

/** Badge cho cả Client (C01, C02): lệch nếu có tài khoản lệch; % là mức lệch lớn nhất. */
export function worstRecon(items: Recon[]): Recon {
  const done = items.filter((i) => i.status !== 'pending' && i.maxSpendDeltaPct !== null);
  if (!done.length) return { status: 'pending', maxSpendDeltaPct: null };
  const max = done.reduce((m, i) => (Number(i.maxSpendDeltaPct) > Number(m) ? i.maxSpendDeltaPct! : m), '0');
  return { status: done.some((i) => i.status === 'warning') ? 'warning' : 'ok', maxSpendDeltaPct: max };
}

const RESULT_LABELS: Record<string, string> = {
  'offsite_conversion.fb_pixel_purchase': 'purchase',
  purchase: 'purchase',
  omni_purchase: 'purchase',
  lead: 'lead',
  'onsite_conversion.lead_grouped': 'lead',
  'offsite_conversion.fb_pixel_lead': 'lead',
  landing_page_view: 'landing_page_view',
  'onsite_conversion.messaging_conversation_started_7d': 'messaging',
};

/** Khóa i18n `recon.metrics.*` cho một dòng D04; `type` dùng khi không có nhãn riêng. */
export function metricLabel(key: string): { key: string; type?: string } {
  if (!key.startsWith('result:')) return { key };
  const type = key.slice('result:'.length);
  const known = RESULT_LABELS[type];
  return known ? { key: known } : { key: 'other', type };
}

/** Ngày lệch còn nằm trong 3 ngày gần nhất → Meta có thể còn điều chỉnh (gợi ý nguyên nhân D04). */
export function recentWarningDates(warningDates: string[], yesterday: string, days = 3): string[] {
  const cutoff = new Date(`${yesterday}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - (days - 1));
  const c = cutoff.toISOString().slice(0, 10);
  return warningDates.filter((d) => d >= c && d <= yesterday);
}
