'use client';

import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, Checkbox, EmptyState, Input, Select, Table, TBody, TD, TH, THead, TR } from '@adxlens/ui';
import { COLUMN_SETS, type ColumnSet, type MetricKey, addDecimal, pausedByParent, pctChange } from '@/lib/grid';
import { ActionDialog, type ActionTarget, type GridActionType } from './entity-actions';

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
  /** G4: đối tượng để tạm dừng / bật lại / đổi ngân sách (chỉ nhóm QC, quảng cáo). */
  target?: ActionTarget;
  /** "Thay đổi gần nhất" qua AdxLens (Madgicx Ads Manager 2.0); undefined = không hiện cột. */
  lastChange?: { actionType: string; status: string; at: string; targetName: string | null } | null;
};

type SortKey = 'name' | MetricKey;
type Show = 'active' | 'spend' | 'all';
const PRESET_KEY = 'adxlens.grid.columns';
/** Bộ lọc lưu được (Madgicx "saved filter presets"): tiện ích riêng người xem, lưu ở trình duyệt. */
const FILTERS_KEY = 'adxlens.grid.filters';
type SavedFilter = { name: string; q: string; show: Show; sort: { key: SortKey; dir: 1 | -1 }; preset: ColumnSet };

const isActive = (s: string | null) => (s ?? '').toUpperCase() === 'ACTIVE';

/**
 * Bảng chiến dịch / nhóm QC / quảng cáo theo cách Google Ads:
 * - G1: mặc định chỉ đối tượng đang chạy hoặc có chi tiêu, tìm, sắp xếp, dòng tổng (cộng decimal), so kỳ trước;
 * - G4: bộ cột (Hiệu suất / Chuyển đổi / Phân phối, nhớ ở trình duyệt); khi được duyệt hành động (cờ bật + quyền):
 *   chọn nhiều + tạm dừng / bật lại hàng loạt, đổi ngân sách nhóm QC — mọi thao tác qua hộp thoại xem trước và
 *   Execution Gateway.
 */
export function EntityGrid({
  rows,
  level,
  showParent = false,
  canAct = false,
}: {
  rows: GridRow[];
  level: 'campaign' | 'adset' | 'ad';
  showParent?: boolean;
  canAct?: boolean;
}) {
  const t = useTranslations('entities');
  const tg = useTranslations('gridActions');
  const tl = useTranslations('actionLog');
  const format = useFormatter();
  const [q, setQ] = useState('');
  const [show, setShow] = useState<Show>('active');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'spend', dir: -1 });
  const [preset, setPreset] = useState<ColumnSet>('performance');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<{ type: GridActionType; targets: ActionTarget[] } | null>(null);
  const actable = canAct && level !== 'campaign';
  const showChanges = rows.some((r) => r.lastChange !== undefined);
  const [saved, setSaved] = useState<SavedFilter[]>([]);
  const multi = new Set(rows.map((r) => r.currency)).size > 1;

  // Bộ cột là tiện ích riêng từng người xem: nhớ ở trình duyệt, lỗi bộ nhớ thì dùng mặc định.
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(PRESET_KEY);
      if (v && v in COLUMN_SETS) setPreset(v as ColumnSet);
    } catch {
      /* bỏ qua */
    }
  }, []);
  useEffect(() => {
    try {
      const v = JSON.parse(window.localStorage.getItem(FILTERS_KEY) ?? '[]') as SavedFilter[];
      if (Array.isArray(v)) setSaved(v.filter((f) => f && typeof f.name === 'string').slice(0, 20));
    } catch {
      /* bỏ qua */
    }
  }, []);
  const storeFilters = (list: SavedFilter[]) => {
    setSaved(list);
    try {
      window.localStorage.setItem(FILTERS_KEY, JSON.stringify(list));
    } catch {
      /* bỏ qua */
    }
  };
  const saveFilter = () => {
    const name = window.prompt(t('grid.saveFilterPrompt'))?.trim();
    if (!name) return;
    storeFilters(
      [{ name: name.slice(0, 40), q, show, sort, preset }, ...saved.filter((f) => f.name !== name)].slice(0, 20),
    );
  };
  const applyFilter = (name: string) => {
    const f = saved.find((x) => x.name === name);
    if (!f) return;
    setQ(f.q);
    setShow(f.show);
    setSort(f.sort);
    if (f.preset in COLUMN_SETS) choosePreset(f.preset);
  };
  const choosePreset = (v: ColumnSet) => {
    setPreset(v);
    try {
      window.localStorage.setItem(PRESET_KEY, v);
    } catch {
      /* bỏ qua */
    }
  };
  const columns = COLUMN_SETS[preset];

  const metric = (k: GridKpis, key: MetricKey): number | null => {
    switch (key) {
      case 'spend':
        return Number(k.spend);
      case 'cpa':
        return k.cpa === null ? null : Number(k.cpa);
      case 'roas':
        return k.roas === null ? null : Number(k.roas);
      case 'conversionValue':
        return Number(k.conversionValue);
      case 'cpm':
        return k.impressions ? (Number(k.spend) / k.impressions) * 1000 : null;
      default:
        return k[key];
    }
  };

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (term && !`${r.name} ${r.parentName ?? ''}`.toLowerCase().includes(term)) return false;
      if (show === 'all') return true;
      const spending = Number(r.cur.spend) > 0;
      return show === 'spend' ? spending : spending || isActive(r.status);
    });
    const val = (r: GridRow): number | string =>
      sort.key === 'name' ? r.name.toLowerCase() : (metric(r.cur, sort.key) ?? -Infinity);
    return [...list].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [rows, q, show, sort]);

  const hidden = rows.length - visible.length;
  const money = (v: string | number | null, cur: string) =>
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
  const cell = (r: GridRow, key: MetricKey) => {
    const v = metric(r.cur, key);
    const prev = r.prev ? metric(r.prev, key) : null;
    switch (key) {
      case 'spend':
      case 'conversionValue':
        return (
          <>
            {money(v, r.currency)}
            {key === 'spend' ? delta(v, prev) : null}
          </>
        );
      case 'cpa':
      case 'cpm':
        return (
          <>
            {money(v, r.currency)}
            {delta(v, prev, true)}
          </>
        );
      case 'ctr':
        return v === null ? '—' : format.number(v, { style: 'percent', maximumFractionDigits: 2 });
      case 'roas':
        return v === null ? '—' : format.number(v, { maximumFractionDigits: 2 });
      case 'results':
        return (
          <>
            {format.number(v ?? 0)}
            {delta(v, prev)}
          </>
        );
      default:
        return format.number(v ?? 0);
    }
  };

  const total = !multi && visible.length ? sumRows(visible) : null;
  const totalCell = (key: MetricKey) => {
    if (!total) return null;
    const cur = visible[0]!.currency;
    switch (key) {
      case 'spend':
        return money(total.spend, cur);
      case 'conversionValue':
        return money(total.conversionValue, cur);
      case 'impressions':
        return format.number(total.impressions);
      case 'linkClicks':
        return format.number(total.linkClicks);
      case 'results':
        return format.number(total.results);
      case 'ctr':
        return total.impressions
          ? format.number(total.linkClicks / total.impressions, { style: 'percent', maximumFractionDigits: 2 })
          : '—';
      case 'cpa':
        return total.results ? money(Number(total.spend) / total.results, cur) : '—';
      case 'cpm':
        return total.impressions ? money((Number(total.spend) / total.impressions) * 1000, cur) : '—';
      case 'roas':
        return Number(total.spend) > 0 && Number(total.conversionValue) > 0
          ? format.number(Number(total.conversionValue) / Number(total.spend), { maximumFractionDigits: 2 })
          : '—';
    }
  };

  const header = (key: SortKey, label: string, numeric = true) => (
    <TH numeric={numeric} key={key}>
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

  const canToggle = (r: GridRow) => Boolean(r.target) && !pausedByParent(r.status);
  const selectedRows = visible.filter((r) => selected.has(r.key) && canToggle(r));
  const toggleable = visible.filter(canToggle);
  const open = (type: GridActionType, targets: ActionTarget[]) => setDialog({ type, targets });
  const pauseType: GridActionType = level === 'ad' ? 'pause_ad' : 'pause_adset';
  const resumeType: GridActionType = level === 'ad' ? 'resume_ad' : 'resume_adset';

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
        <Select
          className="w-44"
          aria-label={t('grid.columns')}
          value={preset}
          onChange={(e) => choosePreset(e.target.value as ColumnSet)}
          data-testid="grid-columns"
        >
          {(Object.keys(COLUMN_SETS) as ColumnSet[]).map((k) => (
            <option key={k} value={k}>
              {t(`grid.sets.${k}`)}
            </option>
          ))}
        </Select>
        <Select
          className="w-44"
          aria-label={t('grid.savedFilters')}
          value=""
          onChange={(e) => applyFilter(e.target.value)}
          data-testid="grid-saved-filters"
        >
          <option value="">{t('grid.savedFilters')}</option>
          {saved.map((f) => (
            <option key={f.name} value={f.name}>
              {f.name}
            </option>
          ))}
        </Select>
        <Button kind="ghost" size="s" onClick={saveFilter} data-testid="grid-save-filter">
          {t('grid.saveFilter')}
        </Button>
        {hidden > 0 ? <span className="text-small text-fg-tertiary">{t('grid.hidden', { count: hidden })}</span> : null}
        {actable && selectedRows.length ? (
          <span className="ml-auto flex items-center gap-2" data-testid="grid-bulk">
            <span className="text-small text-fg-secondary">{tg('selected', { count: selectedRows.length })}</span>
            <Button
              size="s"
              onClick={() =>
                open(
                  pauseType,
                  selectedRows.map((r) => r.target!),
                )
              }
            >
              {tg('pause')}
            </Button>
            <Button
              size="s"
              onClick={() =>
                open(
                  resumeType,
                  selectedRows.map((r) => r.target!),
                )
              }
            >
              {tg('resume')}
            </Button>
            <Button kind="ghost" size="s" onClick={() => setSelected(new Set())}>
              {tg('clear')}
            </Button>
          </span>
        ) : null}
      </div>
      <Card>
        {visible.length === 0 ? (
          <EmptyState title={t(`empty.${level}`)} />
        ) : (
          <Table>
            <THead>
              <tr>
                {actable ? (
                  <TH className="w-8">
                    <Checkbox
                      aria-label={tg('selectAll')}
                      checked={toggleable.length > 0 && toggleable.slice(0, 20).every((r) => selected.has(r.key))}
                      onChange={(e) =>
                        setSelected(e.target.checked ? new Set(toggleable.slice(0, 20).map((r) => r.key)) : new Set())
                      }
                    />
                  </TH>
                ) : null}
                {header('name', t(`level.${level}`), false)}
                <TH>{t('cols.status')}</TH>
                {showChanges ? <TH>{t('cols.lastChange')}</TH> : null}
                {columns.map((k) => header(k, t(`cols.${k}`)))}
                {actable ? <TH>{tg('header')}</TH> : null}
              </tr>
            </THead>
            <TBody>
              {visible.map((r) => (
                <TR key={r.key} data-testid="grid-row">
                  {actable ? (
                    <TD>
                      {canToggle(r) ? (
                        <Checkbox
                          aria-label={tg('select', { name: r.name })}
                          checked={selected.has(r.key)}
                          onChange={(e) =>
                            setSelected((s) => {
                              const next = new Set(s);
                              if (e.target.checked && next.size < 20) next.add(r.key);
                              else next.delete(r.key);
                              return next;
                            })
                          }
                        />
                      ) : null}
                    </TD>
                  ) : null}
                  <TD>
                    <Link href={r.href} className="font-medium text-fg hover:text-brand">
                      {r.name}
                    </Link>
                    {showParent && r.parentName ? (
                      <span className="block text-small text-fg-tertiary">{r.parentName}</span>
                    ) : null}
                  </TD>
                  <TD>
                    <Badge tone={isActive(r.status) ? 'success' : 'neutral'}>
                      {t.has(`status.${(r.status ?? '').toUpperCase()}`)
                        ? t(`status.${(r.status ?? '').toUpperCase()}`)
                        : (r.status ?? '—')}
                    </Badge>
                  </TD>
                  {showChanges ? (
                    <TD className="max-w-[220px]" data-testid="grid-last-change">
                      {r.lastChange ? (
                        <>
                          <span className="block truncate text-small text-fg">
                            {tl.has(`types.${r.lastChange.actionType}`)
                              ? tl(`types.${r.lastChange.actionType}` as never)
                              : r.lastChange.actionType}
                          </span>
                          <span className="block truncate text-caption text-fg-tertiary">
                            {format.dateTime(new Date(r.lastChange.at), {
                              day: '2-digit',
                              month: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                            {level === 'campaign' && r.lastChange.targetName ? ` · ${r.lastChange.targetName}` : ''}
                          </span>
                        </>
                      ) : (
                        <span className="text-fg-tertiary">—</span>
                      )}
                    </TD>
                  ) : null}
                  {columns.map((k) => (
                    <TD numeric key={k}>
                      {cell(r, k)}
                    </TD>
                  ))}
                  {actable ? (
                    <TD>
                      {r.target ? (
                        <span className="flex items-center gap-1">
                          {pausedByParent(r.status) ? (
                            <span className="text-small text-fg-tertiary" data-testid="row-parent-paused">
                              {tg(`parentPaused.${pausedByParent(r.status)!}`)}
                            </span>
                          ) : (
                            <Button
                              kind="ghost"
                              size="s"
                              onClick={() => open(isActive(r.status) ? pauseType : resumeType, [r.target!])}
                              data-testid="row-toggle"
                            >
                              {isActive(r.status) ? tg('pause') : tg('resume')}
                            </Button>
                          )}
                          {level === 'adset' && r.target.dailyBudget ? (
                            <Button kind="ghost" size="s" onClick={() => open('set_adset_budget', [r.target!])}>
                              {tg('budget')}
                            </Button>
                          ) : null}
                        </span>
                      ) : null}
                    </TD>
                  ) : null}
                </TR>
              ))}
              {total ? (
                <TR className="font-semibold" data-testid="grid-total">
                  {actable ? <TD /> : null}
                  <TD>{t('grid.total', { count: visible.length })}</TD>
                  <TD />
                  {showChanges ? <TD /> : null}
                  {columns.map((k) => (
                    <TD numeric key={k}>
                      {totalCell(k)}
                    </TD>
                  ))}
                  {actable ? <TD /> : null}
                </TR>
              ) : null}
            </TBody>
          </Table>
        )}
      </Card>
      {dialog ? (
        <ActionDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          targets={dialog.targets}
          type={dialog.type}
          onDone={() => setSelected(new Set())}
        />
      ) : null}
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
