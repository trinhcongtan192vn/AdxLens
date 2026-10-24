'use client';

import { ImageOff, Search } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { Badge, Card, cn, EmptyState, FilterChip, Input, Select } from '@adxlens/ui';
import { formatMetric, formatPct, LOWER_IS_BETTER } from '@/lib/metric-format';

export type AdCardDto = {
  adAccountId: string;
  accountName: string;
  currency: string;
  metaId: string;
  name: string | null;
  status: string | null;
  campaignName: string | null;
  objective: string | null;
  format: string;
  thumbnailUrl: string | null;
  metrics: Record<string, string | null>;
  prev: Record<string, string | null> | null;
};

const STORE = 'adxlens.w.ads.metrics';
const DEFAULT = ['spend', 'cpa', 'ctr', 'roas'];

function pct(cur: string | null, prev: string | null | undefined): number | null {
  if (cur == null || prev == null || Number(prev) === 0) return null;
  return Math.round(((Number(cur) - Number(prev)) / Math.abs(Number(prev))) * 1000) / 10;
}

/**
 * Lưới quảng cáo (Madgicx Workspace "Ads"): thẻ theo từng quảng cáo — thumbnail, loại, mục tiêu, 4 chỉ số chọn được
 * (nhớ theo trình duyệt), lọc loại / mục tiêu / trạng thái, tìm, sắp xếp.
 */
export function AdsView({ cards, metricOptions }: { cards: AdCardDto[]; metricOptions: readonly string[] }) {
  const t = useTranslations('wsAds');
  const tm = useTranslations('metrics');
  const locale = useLocale();
  const [metrics, setMetrics] = useState<string[]>(DEFAULT);
  const [q, setQ] = useState('');
  const [format, setFormat] = useState<string | null>(null);
  const [objective, setObjective] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'paused'>('all');
  const [sort, setSort] = useState('spend');

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) ?? 'null') as string[] | null;
      if (Array.isArray(saved) && saved.length === 4 && saved.every((m) => metricOptions.includes(m)))
        setMetrics(saved);
    } catch {
      /* trình duyệt chặn lưu trữ: dùng mặc định */
    }
  }, [metricOptions]);
  const setMetric = (i: number, v: string) => {
    const next = metrics.map((m, j) => (j === i ? v : m));
    setMetrics(next);
    try {
      localStorage.setItem(STORE, JSON.stringify(next));
    } catch {
      /* bỏ qua */
    }
  };

  const formats = useMemo(() => [...new Set(cards.map((c) => c.format))], [cards]);
  const objectives = useMemo(() => [...new Set(cards.map((c) => c.objective).filter(Boolean))] as string[], [cards]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = cards.filter(
      (c) =>
        (!needle || `${c.name ?? ''} ${c.campaignName ?? ''}`.toLowerCase().includes(needle)) &&
        (!format || c.format === format) &&
        (!objective || c.objective === objective) &&
        (status === 'all' || (status === 'active' ? c.status === 'ACTIVE' : c.status !== 'ACTIVE')),
    );
    const low = LOWER_IS_BETTER.has(sort);
    return [...list].sort((a, b) => {
      const x = a.metrics[sort];
      const y = b.metrics[sort];
      if (x == null) return 1;
      if (y == null) return -1;
      return low ? Number(x) - Number(y) : Number(y) - Number(x);
    });
  }, [cards, q, format, objective, status, sort]);

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-64">
          <Search className="absolute left-2 top-2 size-4 text-fg-tertiary" aria-hidden />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('search')}
            className="pl-7"
            aria-label={t('search')}
          />
        </div>
        <FilterChip active={format === null} onClick={() => setFormat(null)}>
          {t('allFormats')}
        </FilterChip>
        {formats.map((f) => (
          <FilterChip key={f} active={format === f} onClick={() => setFormat(format === f ? null : f)}>
            {t(`formats.${f}`)}
          </FilterChip>
        ))}
        <Select
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          className="w-48"
          aria-label={t('objective')}
        >
          <option value="">{t('allObjectives')}</option>
          {objectives.map((o) => (
            <option key={o} value={o}>
              {t.has(`objectives.${o}`) ? t(`objectives.${o}`) : o}
            </option>
          ))}
        </Select>
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          className="w-36"
          aria-label={t('status')}
        >
          <option value="all">{t('statusAll')}</option>
          <option value="active">{t('statusActive')}</option>
          <option value="paused">{t('statusPaused')}</option>
        </Select>
        <div className="flex-1" />
        <Select value={sort} onChange={(e) => setSort(e.target.value)} className="w-52" aria-label={t('sort')}>
          {metricOptions.map((m) => (
            <option key={m} value={m}>
              {t('sortBy', { metric: tm(`${m}.name`) })}
            </option>
          ))}
        </Select>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-small text-fg-tertiary">
        <span>{t('metrics')}</span>
        {metrics.map((m, i) => (
          <Select
            key={i}
            value={m}
            onChange={(e) => setMetric(i, e.target.value)}
            className="w-44"
            aria-label={t('metricN', { n: i + 1 })}
          >
            {metricOptions.map((o) => (
              <option key={o} value={o}>
                {tm(`${o}.name`)}
              </option>
            ))}
          </Select>
        ))}
        <span className="ml-auto">{t('count', { n: rows.length })}</span>
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState title={t('emptyTitle')} description={t('emptyBody')} />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" data-testid="ads-grid">
          {rows.map((c) => (
            <Card key={`${c.adAccountId}:${c.metaId}`} className="flex flex-col p-0" data-testid="ad-card">
              <Link href={`/accounts/${c.adAccountId}/ad/${c.metaId}`} className="block">
                {c.thumbnailUrl ? (
                  <img
                    src={c.thumbnailUrl}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="aspect-video w-full rounded-t-lg object-cover"
                  />
                ) : (
                  <span className="flex aspect-video w-full items-center justify-center rounded-t-lg bg-subtle text-fg-tertiary">
                    <ImageOff className="size-6" aria-hidden />
                  </span>
                )}
              </Link>
              <div className="flex flex-1 flex-col gap-2 p-3">
                <div className="flex items-start gap-2">
                  <Link
                    href={`/accounts/${c.adAccountId}/ad/${c.metaId}`}
                    className="line-clamp-2 flex-1 text-small font-medium text-fg hover:text-brand"
                  >
                    {c.name ?? c.metaId}
                  </Link>
                  <Badge tone={c.status === 'ACTIVE' ? 'success' : 'neutral'}>
                    {c.status === 'ACTIVE' ? t('statusActive') : t('statusPaused')}
                  </Badge>
                </div>
                <p className="truncate text-caption text-fg-tertiary">
                  {t(`formats.${c.format}`)}
                  {c.objective
                    ? ` · ${t.has(`objectives.${c.objective}`) ? t(`objectives.${c.objective}`) : c.objective}`
                    : ''}
                  {c.campaignName ? ` · ${c.campaignName}` : ''}
                </p>
                <dl className="mt-auto grid grid-cols-2 gap-x-3 gap-y-2 border-t border-line pt-2">
                  {metrics.map((m) => {
                    const p = pct(c.metrics[m] ?? null, c.prev?.[m]);
                    const good =
                      p == null || p === 0
                        ? null
                        : LOWER_IS_BETTER.has(m)
                          ? p < 0
                          : m === 'spend' || m === 'frequency'
                            ? null
                            : p > 0;
                    return (
                      <div key={m}>
                        <dt className="truncate text-caption text-fg-tertiary">{tm(`${m}.name`)}</dt>
                        <dd className="num text-small font-semibold text-fg">
                          {formatMetric(m, c.metrics[m] ?? null, c.currency, locale, { compact: true })}{' '}
                          <span
                            className={cn(
                              'text-caption font-normal',
                              good === true ? 'text-success' : good === false ? 'text-danger' : 'text-fg-tertiary',
                            )}
                          >
                            {p == null ? '' : formatPct(p, locale)}
                          </span>
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
