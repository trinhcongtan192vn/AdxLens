import { getFormatter, getTranslations } from 'next-intl/server';
import type { Kpis } from '@adxlens/core/reporting';
import { Card, Delta, KpiStat } from '@adxlens/ui';
import { kpiDelta } from '@/lib/kpi';

const KEYS = ['spend', 'results', 'cpa', 'roas', 'ctr', 'impressions'] as const;

/** Hàng KPI (D01, C02): luôn kèm so sánh kỳ trước (design-system KPI Stat). */
export async function KpiRow({ cur, prev, currency }: { cur: Kpis; prev: Kpis; currency: string }) {
  const t = await getTranslations('account');
  const format = await getFormatter();
  const money = (v: string | null) =>
    v === null ? '—' : format.number(Number(v), { maximumFractionDigits: currency === 'VND' ? 0 : 2 });
  const value = (k: (typeof KEYS)[number], m: Kpis): string | number | null =>
    k === 'spend'
      ? m.spend
      : k === 'results'
        ? m.results
        : k === 'cpa'
          ? m.cpa
          : k === 'roas'
            ? m.roas
            : k === 'ctr'
              ? m.ctr
              : m.impressions;
  const show = (k: (typeof KEYS)[number], m: Kpis) => {
    const v = value(k, m);
    if (v === null) return '—';
    if (k === 'spend' || k === 'cpa') return money(String(v));
    if (k === 'roas') return format.number(Number(v), { maximumFractionDigits: 2 });
    if (k === 'ctr') return format.number(Number(v), { style: 'percent', maximumFractionDigits: 2 });
    return format.number(Number(v));
  };
  return (
    <Card className="flex flex-wrap divide-x divide-line">
      {KEYS.map((k) => {
        const d = kpiDelta(k, value(k, cur), value(k, prev));
        return (
          <KpiStat
            key={k}
            label={t(`kpi.${k}`)}
            value={show(k, cur)}
            delta={
              d ? (
                <Delta
                  direction={d.direction}
                  good={d.good}
                  text={format.number(d.pct, { style: 'percent', maximumFractionDigits: 1 })}
                />
              ) : null
            }
            compare={d ? t('vsPrev') : null}
          />
        );
      })}
    </Card>
  );
}
