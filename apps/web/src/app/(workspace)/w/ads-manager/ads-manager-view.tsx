'use client';

import { ChevronDown, ChevronRight, Columns3, Pencil, Search, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Badge,
  Button,
  buttonVariants,
  Card,
  Checkbox,
  cn,
  Dialog,
  EmptyState,
  Input,
  Segmented,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@adxlens/ui';
import { ActionDialog, type ActionTarget, type GridActionType } from '@/components/entity-actions';
import { Sparkline } from '@/components/workspace/sparkline';
import { ZERO_DECIMAL } from '@/lib/actions';
import { formatMetric, formatPct, LOWER_IS_BETTER } from '@/lib/metric-format';

type Values = Record<string, string | null>;
export type AmRowDto = {
  level: 'campaign' | 'adset' | 'ad';
  adAccountId: string;
  currency: string;
  metaId: string;
  parentMetaId: string | null;
  name: string | null;
  status: string | null;
  dailyBudget: string | null;
  metrics: Values;
  prev: Values | null;
  series: (Values | null)[];
};

const STORE = 'adxlens.w.am.columns';
const DEFAULT_COLS = ['spend', 'results', 'cpa', 'ctr', 'cpm', 'roas'];
type View = 'tree' | 'adset' | 'ad';

function change(cur: string | null | undefined, prev: string | null | undefined): number | null {
  if (cur == null || prev == null || Number(prev) === 0) return null;
  return Math.round(((Number(cur) - Number(prev)) / Math.abs(Number(prev))) * 1000) / 10;
}

const isActive = (s: string | null) => s === 'ACTIVE';

/**
 * Ads Manager của Workspace (Madgicx "Ads Manager"): 3 chế độ xem (cây Chiến dịch › Nhóm QC › Quảng cáo, phẳng theo
 * nhóm QC, phẳng theo quảng cáo); cột chọn được (nhớ theo trình duyệt); mỗi ô có giá trị, % so kỳ trước và sparkline;
 * dòng tổng; ẩn đối tượng không chi tiêu; bật / tắt nhóm QC, quảng cáo qua Execution Gateway (khi được phép).
 */
export function AdsManagerView({
  rows,
  total,
  totalPrev,
  currency,
  metricOptions,
  canAct,
  canAsk = false,
}: {
  rows: AmRowDto[];
  total: Values;
  totalPrev: Values;
  currency: string | null;
  metricOptions: readonly string[];
  canAct: boolean;
  /** Cờ P1: chọn đối tượng làm ngữ cảnh hỏi AI Agents (Madgicx roadmap chat). */
  canAsk?: boolean;
}) {
  const t = useTranslations('wsAm');
  const tm = useTranslations('metrics');
  const tc = useTranslations('common');
  const locale = useLocale();
  const [cols, setCols] = useState<string[]>(DEFAULT_COLS);
  const [colsOpen, setColsOpen] = useState(false);
  const [view, setView] = useState<View>('tree');
  const [hideZero, setHideZero] = useState(true);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Map<string, AmRowDto>>(new Map());
  const [dialog, setDialog] = useState<{ type: GridActionType; targets: ActionTarget[] } | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) ?? 'null') as string[] | null;
      if (Array.isArray(saved) && saved.length && saved.every((c) => metricOptions.includes(c))) setCols(saved);
    } catch {
      /* dùng mặc định */
    }
  }, [metricOptions]);
  const saveCols = (next: string[]) => {
    setCols(next);
    try {
      localStorage.setItem(STORE, JSON.stringify(next));
    } catch {
      /* bỏ qua */
    }
  };

  const k = (r: AmRowDto) => `${r.adAccountId}:${r.level}:${r.metaId}`;
  const needle = q.trim().toLowerCase();
  const spendOk = (r: AmRowDto) => !hideZero || Number(r.metrics.spend ?? 0) > 0;
  const matches = (r: AmRowDto) => !needle || (r.name ?? '').toLowerCase().includes(needle);
  const children = useMemo(() => {
    const m = new Map<string, AmRowDto[]>();
    for (const r of rows) {
      if (!r.parentMetaId) continue;
      const key = `${r.adAccountId}:${r.parentMetaId}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(r);
    }
    for (const list of m.values()) list.sort((a, b) => Number(b.metrics.spend ?? 0) - Number(a.metrics.spend ?? 0));
    return m;
  }, [rows]);
  const kidsOf = (r: AmRowDto) => (children.get(`${r.adAccountId}:${r.metaId}`) ?? []).filter(spendOk);
  const hasMatch = (r: AmRowDto): boolean => matches(r) || (r.level !== 'ad' && kidsOf(r).some(hasMatch));
  const top = rows
    .filter((r) => r.level === (view === 'tree' ? 'campaign' : view))
    .filter((r) => spendOk(r) && (view === 'tree' ? hasMatch(r) : matches(r)))
    .sort((a, b) => Number(b.metrics.spend ?? 0) - Number(a.metrics.spend ?? 0));

  const toggleSel = (r: AmRowDto) =>
    setSelected((s) => {
      const n = new Map(s);
      if (n.has(k(r))) n.delete(k(r));
      else n.set(k(r), r);
      return n;
    });
  const sel = [...selected.values()];
  // Ngân sách Meta theo đơn vị nhỏ nhất (VND… = 1, USD… = cent).
  const budgetText = (v: string, currency: string) => {
    const div = ZERO_DECIMAL.has(currency) ? 1 : 100;
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: div === 1 ? 0 : 2,
    }).format(Number(v) / div);
  };
  // Hỏi AI về các mục đã chọn: cùng một cấp (cấp của mục chọn đầu), tối đa 20.
  const askHref = () => {
    const lvl = sel[0]?.level ?? 'campaign';
    const ids = sel
      .filter((r) => r.level === lvl)
      .slice(0, 20)
      .map((r) => r.metaId);
    return `/w/agents?level=${lvl}&ids=${ids.join(',')}`;
  };
  const act = (type: 'pause' | 'resume') => {
    const list = sel.filter(
      (r) => r.level !== 'campaign' && (type === 'pause' ? isActive(r.status) : !isActive(r.status)),
    );
    const lvl = list[0]?.level;
    const same = list.filter((r) => r.level === lvl);
    if (!same.length) return;
    setDialog({
      type: `${type}_${lvl}` as GridActionType,
      targets: same.map((r) => ({
        adAccountId: r.adAccountId,
        metaId: r.metaId,
        name: r.name ?? r.metaId,
        dailyBudget: r.dailyBudget,
      })),
    });
  };

  const cell = (
    r: { metrics: Values; prev: Values | null; series?: (Values | null)[]; currency: string },
    c: string,
  ) => {
    const p = change(r.metrics[c], r.prev?.[c]);
    const good =
      p == null || p === 0 || c === 'spend' || c === 'frequency' ? null : LOWER_IS_BETTER.has(c) ? p < 0 : p > 0;
    return (
      <TD key={c} numeric className="align-top">
        <div className="flex flex-col items-end">
          <span className="num font-medium text-fg">{formatMetric(c, r.metrics[c], r.currency, locale)}</span>
          <span
            className={cn(
              'num text-caption',
              good === true ? 'text-success' : good === false ? 'text-danger' : 'text-fg-tertiary',
            )}
          >
            {p == null ? '—' : formatPct(p, locale)}
          </span>
          {r.series ? (
            <Sparkline
              values={r.series.map((d) => d?.[c] ?? null)}
              width={72}
              height={18}
              tone={good === true ? 'good' : good === false ? 'bad' : 'neutral'}
            />
          ) : null}
        </div>
      </TD>
    );
  };

  const line = (r: AmRowDto, depth: number): ReactNode => {
    const kids = r.level === 'ad' || view !== 'tree' ? [] : kidsOf(r).filter(hasMatch);
    const expanded = open.has(k(r));
    const level = r.level === 'campaign' ? 'campaign' : r.level;
    return (
      <Fragment key={k(r)}>
        <TR data-testid={`am-row-${r.level}`}>
          <TD className="w-8">
            {(canAct && r.level !== 'campaign') || canAsk ? (
              <Checkbox
                checked={selected.has(k(r))}
                onChange={() => toggleSel(r)}
                aria-label={t('select', { name: r.name ?? r.metaId })}
              />
            ) : null}
          </TD>
          <TD>
            <div className="flex items-center gap-1" style={{ paddingLeft: depth * 20 }}>
              {kids.length ? (
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-label={expanded ? t('collapse') : t('expand')}
                  onClick={() =>
                    setOpen((s) => {
                      const n = new Set(s);
                      if (n.has(k(r))) n.delete(k(r));
                      else n.add(k(r));
                      return n;
                    })
                  }
                  className="rounded p-0.5 text-fg-tertiary hover:bg-hover"
                >
                  {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                </button>
              ) : (
                <span className="w-5" />
              )}
              <span
                className={cn('size-2 shrink-0 rounded-full', isActive(r.status) ? 'bg-success' : 'bg-fg-disabled')}
                aria-hidden
              />
              <Link
                href={`/accounts/${r.adAccountId}/${level}/${r.metaId}`}
                className="max-w-[320px] truncate text-small font-medium text-fg hover:text-brand"
              >
                {r.name ?? r.metaId}
              </Link>
              <Badge tone="neutral" className="ml-1">
                {t(`levels.${r.level}`)}
              </Badge>
            </div>
          </TD>
          <TD numeric data-testid={r.level === 'adset' ? 'am-budget' : undefined}>
            {r.level === 'adset' && r.dailyBudget ? (
              <span className="inline-flex items-center gap-1">
                {budgetText(r.dailyBudget, r.currency)}
                {canAct ? (
                  <button
                    type="button"
                    className="rounded p-0.5 text-fg-tertiary hover:bg-hover hover:text-fg"
                    aria-label={t('editBudget', { name: r.name ?? r.metaId })}
                    data-testid="am-edit-budget"
                    onClick={() =>
                      setDialog({
                        type: 'set_adset_budget',
                        targets: [
                          {
                            adAccountId: r.adAccountId,
                            metaId: r.metaId,
                            name: r.name ?? r.metaId,
                            dailyBudget: r.dailyBudget,
                          },
                        ],
                      })
                    }
                  >
                    <Pencil className="size-3.5" aria-hidden />
                  </button>
                ) : null}
              </span>
            ) : (
              <span className="text-fg-tertiary">—</span>
            )}
          </TD>
          {cols.map((c) => cell(r, c))}
        </TR>
        {expanded ? kids.map((c) => line(c, depth + 1)) : null}
      </Fragment>
    );
  };

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented<View>
          value={view}
          onChange={setView}
          options={[
            { value: 'tree', label: t('views.tree') },
            { value: 'adset', label: t('views.adset') },
            { value: 'ad', label: t('views.ad') },
          ]}
        />
        <div className="relative w-60">
          <Search className="absolute left-2 top-2 size-4 text-fg-tertiary" aria-hidden />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('search')}
            className="pl-7"
            aria-label={t('search')}
          />
        </div>
        <label className="flex items-center gap-1 text-small text-fg-secondary">
          <Checkbox checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} />
          {t('hideZero')}
        </label>
        <div className="flex-1" />
        {sel.length ? <span className="text-small text-fg-secondary">{t('selected', { n: sel.length })}</span> : null}
        {canAsk && sel.length ? (
          <a href={askHref()} className={buttonVariants({ kind: 'secondary', size: 's' })} data-testid="am-ask-ai">
            <Sparkles className="size-4" aria-hidden />
            {t('askAi')}
          </a>
        ) : null}
        {canAct && sel.some((r) => r.level !== 'campaign') ? (
          <>
            <Button kind="secondary" size="s" onClick={() => act('pause')}>
              {t('pause')}
            </Button>
            <Button kind="secondary" size="s" onClick={() => act('resume')}>
              {t('resume')}
            </Button>
          </>
        ) : null}
        <Button kind="secondary" size="s" onClick={() => setColsOpen(true)}>
          <Columns3 className="size-4" aria-hidden />
          {t('columns')}
        </Button>
      </div>

      {top.length === 0 ? (
        <Card>
          <EmptyState title={t('emptyTitle')} description={t('emptyBody')} />
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <Table data-testid="ads-manager">
            <THead>
              <tr>
                <TH className="w-8" />
                <TH>{t(`views.${view}`)}</TH>
                <TH numeric>{t('dailyBudget')}</TH>
                {cols.map((c) => (
                  <TH key={c} numeric>
                    {tm(`${c}.name`)}
                  </TH>
                ))}
              </tr>
            </THead>
            <TBody>
              <TR className="bg-subtle font-semibold" data-testid="am-total">
                <TD />
                <TD className="text-small">{t('total')}</TD>
                <TD />
                {cols.map((c) => cell({ metrics: total, prev: totalPrev, currency: currency ?? 'VND' }, c))}
              </TR>
              {top.map((r) => line(r, 0))}
            </TBody>
          </Table>
        </Card>
      )}

      <Dialog
        open={colsOpen}
        onOpenChange={setColsOpen}
        title={t('columns')}
        description={t('columnsHint')}
        closeLabel={tc('close')}
        footer={
          <Button kind="primary" size="m" onClick={() => setColsOpen(false)}>
            {tc('close')}
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-2">
          {metricOptions.map((m) => {
            const on = cols.includes(m);
            return (
              <label key={m} className="flex items-center gap-2 text-small text-fg">
                <Checkbox
                  checked={on}
                  disabled={!on && cols.length >= 10}
                  onChange={() => saveCols(on ? cols.filter((c) => c !== m) : [...cols, m])}
                />
                {tm(`${m}.name`)}
              </label>
            );
          })}
        </div>
      </Dialog>

      {dialog ? (
        <ActionDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          targets={dialog.targets}
          type={dialog.type}
          onDone={() => setSelected(new Map())}
        />
      ) : null}
    </>
  );
}
