'use client';

import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useMemo, useState, type ReactNode } from 'react';
import { Badge, Card, EmptyState, Input, Select, Table, TBody, TD, TH, THead, TR } from '@adxlens/ui';
import { addDecimal, pctChange } from '@/lib/grid';

export type GridKpis = {
  spend: string;
  impressions: number;
  linkClicks: number;
  results: number;
  conversionValue: string;
  cpa: string | null;
  roas: string | null;
  ctr: number | null;
};
export type GridRow = {
  key: string;
  href: string;
  name: string;
  parentName?: string | null;
  status: string | null;
  currency: string;
  cur: GridKpis;
  prev: GridKpis | null;
  /** Ô thao tác (G4: bật / tắt, ngân sách) do trang truyền vào, đã render sẵn ở server hoặc client. */
  actions?: ReactNode;
};

type SortKey = 'name' | 'spend' | 'impressions' | 'linkClicks' | 'ctr' | 'results' | 'cpa' | 'roas';
type Show = 'active' | 'spend' | 'all';

/**
 * Bảng chiến dịch / nhóm QC / quảng cáo (G1, theo cách Google Ads): mặc định chỉ hiện đối tượng đang chạy hoặc có
 * chi tiêu trong kỳ, tìm theo tên, sắp xếp theo cột, dòng tổng (cộng decimal, không qua số thực), so với kỳ trước.
 */
export function EntityGrid({
  rows,
  level,
  showParent = false,
  actionsHeader,
}: {
  rows: GridRow[];
  level: 'campaign' | 'adset' | 'ad';
  showParent?: boolean;
  actionsHeader?: string;
}) {
  const t = useTranslations('entities');
  const format = useFormatter();
  const [q, setQ] = useState('');
  const [show, setShow] = useState<Show>('active');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'spend', dir: -1 });
  const currencies = new Set(rows.map((r) => r.currency));
  const multi = currencies.size > 1;

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (term && !`${r.name} ${r.parentName ?? ''}`.toLowerCase().includes(term)) return false;
      if (show === 'all') return true;
      const spending = Number(r.cur.spend) > 0;
      return show === 'spend' ? spending : spending || (r.status ?? '').toUpperCase() === 'ACTIVE';
    });
    const val = (r: GridRow): number | string => {
      if (sort.key === 'name') return r.name.toLowerCase();
      const v = r.cur[sort.key];
      return v === null ? -Infinity : Number(v);
    };
    return [...list].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [rows, q, show, sort]);

  const hidden = rows.length - visible.length;
  const money = (v: string | null, cur: string) =>
    v === null
      ? '—'
      : `${format.number(Number(v), { maximumFractionDigits: cur === 'VND' ? 0 : 2 })}${multi ? ` ${cur}` : ''}`;
  const delta = (cur: number | null, prev: number | null | undefined, lowerIsBetter = false) => {
    const p = pctChange(cur, prev ?? null);
    if (p === null) return null;
    const good = lowerIsBetter ? p < 0 : p > 0;
    return (
      <span className={`block text-caption ${p === 0 ? 'text-fg-tertiary' : good ? 'text-success' : 'text-danger'}`}>
        {p > 0 ? '+' : ''}
        {format.number(p, { maximumFractionDigits: 1 })}%
      </span>
    );
  };

  // Dòng tổng chỉ khi một tiền tệ (cộng tiền khác tiền tệ không có nghĩa).
  const total = !multi && visible.length ? sumRows(visible) : null;
  const header = (key: SortKey, label: string, numeric = true) => (
    <TH numeric={numeric}>
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:text-fg"
        onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === 'name' ? 1 : -1 }))}
        aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
      >
        {label}
        {sort.key === key ? <span aria-hidden>{sort.dir === 1 ? '↑' : '↓'}</span> : null}
      </button>
    </TH>
  );

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Input
          className="w-64"
          aria-label={t('grid.search')}
          placeholder={t('grid.search')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select
          className="w-56"
          aria-label={t('grid.show')}
          value={show}
          onChange={(e) => setShow(e.target.value as Show)}
          data-testid="grid-show"
        >
          <option value="active">{t('grid.showActive')}</option>
          <option value="spend">{t('grid.showSpend')}</option>
          <option value="all">{t('grid.showAll')}</option>
        </Select>
        {hidden > 0 ? <span className="text-small text-fg-tertiary">{t('grid.hidden', { count: hidden })}</span> : null}
      </div>
      <Card>
        {visible.length === 0 ? (
          <EmptyState title={t(`empty.${level}`)} />
        ) : (
          <Table>
            <THead>
              <tr>
                {header('name', t(`level.${level}`), false)}
                <TH>{t('cols.status')}</TH>
                {header('spend', t('cols.spend'))}
                {header('impressions', t('cols.impressions'))}
                {header('linkClicks', t('cols.clicks'))}
                {header('ctr', t('cols.ctr'))}
                {header('results', t('cols.results'))}
                {header('cpa', t('cols.cpa'))}
                {header('roas', t('cols.roas'))}
                {actionsHeader !== undefined ? <TH>{actionsHeader}</TH> : null}
              </tr>
            </THead>
            <TBody>
              {visible.map((r) => (
                <TR key={r.key} data-testid="grid-row">
                  <TD>
                    <Link href={r.href} className="font-medium text-fg hover:text-brand">
                      {r.name}
                    </Link>
                    {showParent && r.parentName ? (
                      <span className="block text-small text-fg-tertiary">{r.parentName}</span>
                    ) : null}
                  </TD>
                  <TD>
                    <Badge tone={(r.status ?? '').toUpperCase() === 'ACTIVE' ? 'success' : 'neutral'}>
                      {t.has(`status.${(r.status ?? '').toUpperCase()}`)
                        ? t(`status.${(r.status ?? '').toUpperCase()}`)
                        : (r.status ?? '—')}
                    </Badge>
                  </TD>
                  <TD numeric>
                    {money(r.cur.spend, r.currency)}
                    {delta(Number(r.cur.spend), r.prev ? Number(r.prev.spend) : null)}
                  </TD>
                  <TD numeric>{format.number(r.cur.impressions)}</TD>
                  <TD numeric>{format.number(r.cur.linkClicks)}</TD>
                  <TD numeric>
                    {r.cur.ctr === null
                      ? '—'
                      : format.number(r.cur.ctr, { style: 'percent', maximumFractionDigits: 2 })}
                  </TD>
                  <TD numeric>
                    {format.number(r.cur.results)}
                    {delta(r.cur.results, r.prev?.results)}
                  </TD>
                  <TD numeric>
                    {money(r.cur.cpa, r.currency)}
                    {delta(
                      r.cur.cpa === null ? null : Number(r.cur.cpa),
                      r.prev?.cpa ? Number(r.prev.cpa) : null,
                      true,
                    )}
                  </TD>
                  <TD numeric>
                    {r.cur.roas === null ? '—' : format.number(Number(r.cur.roas), { maximumFractionDigits: 2 })}
                  </TD>
                  {actionsHeader !== undefined ? <TD>{r.actions ?? null}</TD> : null}
                </TR>
              ))}
              {total ? (
                <TR className="font-semibold" data-testid="grid-total">
                  <TD>{t('grid.total', { count: visible.length })}</TD>
                  <TD />
                  <TD numeric>{money(total.spend, visible[0]!.currency)}</TD>
                  <TD numeric>{format.number(total.impressions)}</TD>
                  <TD numeric>{format.number(total.linkClicks)}</TD>
                  <TD numeric>
                    {total.impressions
                      ? format.number(total.linkClicks / total.impressions, {
                          style: 'percent',
                          maximumFractionDigits: 2,
                        })
                      : '—'}
                  </TD>
                  <TD numeric>{format.number(total.results)}</TD>
                  <TD numeric>
                    {total.results ? money(String(Number(total.spend) / total.results), visible[0]!.currency) : '—'}
                  </TD>
                  <TD numeric>
                    {Number(total.spend) > 0 && Number(total.conversionValue) > 0
                      ? format.number(Number(total.conversionValue) / Number(total.spend), { maximumFractionDigits: 2 })
                      : '—'}
                  </TD>
                  {actionsHeader !== undefined ? <TD /> : null}
                </TR>
              ) : null}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}

function sumRows(rows: GridRow[]) {
  return rows.reduce(
    (t, r) => ({
      spend: addDecimal(t.spend, r.cur.spend),
      conversionValue: addDecimal(t.conversionValue, r.cur.conversionValue),
      impressions: t.impressions + r.cur.impressions,
      linkClicks: t.linkClicks + r.cur.linkClicks,
      results: t.results + r.cur.results,
    }),
    { spend: '0', conversionValue: '0', impressions: 0, linkClicks: 0, results: 0 },
  );
}
