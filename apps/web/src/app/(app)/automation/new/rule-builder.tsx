'use client';

import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Banner, Button, Card, CardHeader, Field, Input, Select, Table, TBody, TD, TH, THead, TR } from '@adxlens/ui';
import { api, ApiError } from '@/lib/api-client';

type Cond = { metric: string; op: 'gte' | 'lte'; value: string };
type Action = {
  type: 'pause_ad' | 'pause_adset' | 'set_adset_budget' | 'suggest_resume';
  changePct?: string;
  maxDailyBudget?: string;
  floorDailyBudget?: string;
  revert?: { kind: 'restore_budget' | 'suggest_undo'; hour: number };
};
type Savings = { kind: 'saved' | 'extra' | 'none'; amount: string; currency: string; entities: number; days: number };
type Suggested = { index: number; value: string; reason: { key: string; params: Record<string, string> } };
type Template = {
  key: string;
  level: 'ad' | 'adset';
  condition: Cond[];
  action: Action;
  doneCount: number;
  requiresMaxDailyBudget?: boolean;
  requiresFloorDailyBudget?: boolean;
  tactic?: boolean;
};

const METRICS = [
  'spend',
  'results',
  'cpa',
  'ctr',
  'frequency',
  'ctr_change_pct',
  'cpa_change_pct',
  'link_clicks',
  'roas',
  'spend_1d',
  'results_1d',
  'link_clicks_1d',
  'cpa_1d',
  'roas_1d',
] as const;
/** Giờ hẹn ngoài giờ yên tĩnh mặc định (22:00–06:00); server kiểm lại theo guardrails của workspace. */
const REVERT_HOURS = Array.from({ length: 16 }, (_, i) => i + 6);

/** P212: chọn mẫu → chỉnh điều kiện / hành động / giới hạn → backtest (P213) → lưu ở chế độ shadow. */
export function RuleBuilder({
  accounts,
  templates,
  initialTemplate,
  initialAccountId,
}: {
  accounts: { id: string; name: string }[];
  templates: Template[];
  /** Mở từ "Tạo automation từ gợi ý này" (Việc tuần này). */
  initialTemplate?: string | null;
  initialAccountId?: string | null;
}) {
  const t = useTranslations('automation');
  const ta = useTranslations('actionLog');
  const tc = useTranslations('common');
  const router = useRouter();
  const format = useFormatter();
  const first = templates.find((x) => x.key === initialTemplate) ?? templates[0]!;
  const [templateKey, setTemplateKey] = useState(first.key);
  const [accountId, setAccountId] = useState(
    accounts.find((a) => a.id === initialAccountId)?.id ?? accounts[0]?.id ?? '',
  );
  const [savings, setSavings] = useState<Savings | null>(null);
  const [suggested, setSuggested] = useState<Suggested[]>([]);
  const [name, setName] = useState(t(`templates.${first.key}` as never));
  const [level, setLevel] = useState<'ad' | 'adset'>(first.level);
  const [conds, setConds] = useState<Cond[]>(first.condition);
  // ADR-0014: VÀ (mọi điều kiện) / HOẶC (ít nhất một).
  const [match, setMatch] = useState<'all' | 'any'>('all');
  const [action, setAction] = useState<Action>(first.action);
  const [maxPerDay, setMaxPerDay] = useState('');
  // Lịch chạy theo ngày / giờ trong tuần (giờ tài khoản); tắt = chạy mọi lúc ngoài giờ yên tĩnh.
  const [schedOn, setSchedOn] = useState(false);
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [startHour, setStartHour] = useState(8);
  const [endHour, setEndHour] = useState(20);
  const [backtest, setBacktest] = useState<
    { date: string; name: string | null; metaId: string; newDailyBudget: string | null }[] | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const pick = (key: string) => {
    const tpl = templates.find((x) => x.key === key)!;
    setTemplateKey(key);
    setName(t(`templates.${key}` as never));
    setLevel(tpl.level);
    setConds(tpl.condition);
    setMatch('all');
    setAction(tpl.action);
    setBacktest(null);
  };
  // Ngưỡng theo dữ liệu 30 ngày của tài khoản (Madgicx "Why this value?"); lỗi / thiếu dữ liệu → giữ giá trị mẫu.
  useEffect(() => {
    if (!accountId) return;
    let alive = true;
    api<{ condition: Cond[]; suggested: Suggested[] }>(
      `automation-rules/templates/suggest?template=${encodeURIComponent(templateKey)}&adAccountId=${accountId}`,
    )
      .then((r) => {
        if (!alive) return;
        setConds(r.condition);
        setSuggested(r.suggested);
        setBacktest(null);
        setSavings(null);
      })
      .catch(() => alive && setSuggested([]));
    return () => {
      alive = false;
    };
  }, [templateKey, accountId]);
  const money = (amount: string, currency: string) =>
    format.number(Number(amount), { style: 'currency', currency, maximumFractionDigits: currency === 'VND' ? 0 : 2 });
  const body = () => ({
    adAccountId: accountId,
    name,
    templateKey,
    level,
    match,
    condition: conds,
    action,
    guardrails: {
      ...(maxPerDay ? { maxActionsPerDay: Number(maxPerDay) } : {}),
      ...(schedOn ? { schedule: { days, startHour, endHour } } : {}),
    },
  });
  const showError = (e: unknown) => {
    const code = e instanceof ApiError ? e.code : 'INTERNAL';
    setError(t.has(`errors.${code}`) ? t(`errors.${code}` as never) : tc('errorGeneric'));
  };
  const runBacktest = () =>
    start(async () => {
      setError(null);
      try {
        const r = await api<
          Savings & { items: { date: string; name: string | null; metaId: string; newDailyBudget: string | null }[] }
        >('automation-rules/backtest', { method: 'POST', body: body() });
        setBacktest(r.items);
        setSavings(r);
      } catch (e) {
        showError(e);
      }
    });
  const save = () =>
    start(async () => {
      setError(null);
      try {
        const r = await api<{ id: string }>('automation-rules', { method: 'POST', body: body() });
        toast.success(t('saved'));
        router.push(`/automation/${r.id}`);
      } catch (e) {
        showError(e);
      }
    });
  const setCond = (i: number, patch: Partial<Cond>) => {
    setConds(conds.map((c, j) => (j === i ? { ...c, ...patch } : c)));
    if (patch.value !== undefined || patch.metric !== undefined) setSuggested(suggested.filter((s) => s.index !== i));
    setBacktest(null);
    setSavings(null);
  };

  return (
    <div className="flex max-w-[880px] flex-col gap-4">
      <Card>
        <CardHeader title={t('template')} />
        {([false, true] as const).map((tactic) => {
          const list = templates.filter((x) => Boolean(x.tactic) === tactic);
          if (!list.length) return null;
          return (
            <div key={String(tactic)} className="px-4 py-3" data-testid={tactic ? 'rule-tactics' : undefined}>
              {tactic ? <p className="mb-2 text-small font-semibold text-fg">{t('tacticsTitle')}</p> : null}
              <div className="flex flex-wrap gap-2">
                {list.map((x) => (
                  <Button
                    key={x.key}
                    kind={x.key === templateKey ? 'primary' : 'secondary'}
                    size="s"
                    onClick={() => pick(x.key)}
                  >
                    {t(`templates.${x.key}` as never)}
                    {x.doneCount ? ` · ${t('doneCount', { count: x.doneCount })}` : ''}
                  </Button>
                ))}
              </div>
            </div>
          );
        })}
        {t.has(`tacticHelp.${templateKey}` as never) ? (
          <p className="border-t border-line px-4 py-2 text-small text-fg-secondary" data-testid="rule-tactic-help">
            {t(`tacticHelp.${templateKey}` as never)}
          </p>
        ) : null}
      </Card>
      <Card>
        <div className="flex flex-col gap-3 px-4 py-4">
          <Field label={t('fields.name')} htmlFor="rule-name">
            <Input id="rule-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={t('fields.account')} htmlFor="rule-account">
            <Select id="rule-account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <div>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <p className="text-body font-medium text-fg">{t('fields.when', { level: t(`levels.${level}`) })}</p>
              <Select
                aria-label={t('fields.match')}
                className="w-56"
                value={match}
                onChange={(e) => setMatch(e.target.value as 'all' | 'any')}
                data-testid="rule-match"
              >
                <option value="all">{t('match.all')}</option>
                <option value="any">{t('match.any')}</option>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              {conds.map((c, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2" data-testid="rule-condition">
                  <Select
                    aria-label={t('fields.metric')}
                    value={c.metric}
                    onChange={(e) => setCond(i, { metric: e.target.value })}
                    className="w-auto"
                  >
                    {METRICS.map((m) => (
                      <option key={m} value={m}>
                        {t(`metrics.${m}`)}
                      </option>
                    ))}
                  </Select>
                  <Select
                    aria-label={t('fields.op')}
                    value={c.op}
                    onChange={(e) => setCond(i, { op: e.target.value as Cond['op'] })}
                    className="w-auto"
                  >
                    <option value="gte">≥</option>
                    <option value="lte">≤</option>
                  </Select>
                  <Input
                    aria-label={t('fields.value')}
                    value={c.value}
                    onChange={(e) => setCond(i, { value: e.target.value.trim() })}
                    className="w-32"
                  />
                  {conds.length > 1 ? (
                    <Button kind="ghost" size="s" onClick={() => setConds(conds.filter((_, j) => j !== i))}>
                      {t('remove')}
                    </Button>
                  ) : null}
                  {suggested
                    .filter((s) => s.index === i && s.value === c.value)
                    .map((s) => (
                      <p
                        key={s.index}
                        className="basis-full text-caption text-fg-tertiary"
                        data-testid="rule-why-value"
                      >
                        <span className="font-medium text-fg-secondary">{t('whyValue')}</span>{' '}
                        {t(
                          `suggestReasons.${s.reason.key}` as never,
                          {
                            ...s.reason.params,
                            cpa: s.reason.params.cpa ? money(s.reason.params.cpa, s.reason.params.currency!) : '',
                            cpc: s.reason.params.cpc ? money(s.reason.params.cpc, s.reason.params.currency!) : '',
                          } as never,
                        )}
                      </p>
                    ))}
                </div>
              ))}
              {conds.length < 6 ? (
                <div>
                  <Button
                    kind="ghost"
                    size="s"
                    onClick={() => setConds([...conds, { metric: 'spend', op: 'gte', value: '0' }])}
                  >
                    {t('addCondition')}
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
          <p className="text-body text-fg">
            {t('fields.then')} <strong>{ta(`types.${action.type}` as never)}</strong>
            {action.type === 'set_adset_budget' ? ` ${action.changePct ?? ''}%` : ''}
          </p>
          {action.type === 'set_adset_budget' ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('fields.changePct')} htmlFor="rule-pct" hint={t('pctHint')}>
                <Input
                  id="rule-pct"
                  value={action.changePct ?? ''}
                  onChange={(e) => setAction({ ...action, changePct: e.target.value.trim() })}
                />
              </Field>
              <Field
                label={t('fields.maxDailyBudget')}
                htmlFor="rule-max"
                hint={
                  templates.find((x) => x.key === templateKey)?.requiresMaxDailyBudget ? t('maxRequired') : t('maxHint')
                }
              >
                <Input
                  id="rule-max"
                  inputMode="numeric"
                  value={action.maxDailyBudget ?? ''}
                  onChange={(e) => setAction({ ...action, maxDailyBudget: e.target.value.trim() || undefined })}
                />
              </Field>
            </div>
          ) : null}
          {action.type === 'set_adset_budget' && Number(action.changePct ?? 0) < 0 ? (
            <Field
              label={t('fields.floorDailyBudget')}
              htmlFor="rule-floor"
              hint={
                templates.find((x) => x.key === templateKey)?.requiresFloorDailyBudget
                  ? t('floorRequired')
                  : t('floorHint')
              }
            >
              <Input
                id="rule-floor"
                inputMode="numeric"
                value={action.floorDailyBudget ?? ''}
                onChange={(e) => setAction({ ...action, floorDailyBudget: e.target.value.trim() || undefined })}
              />
            </Field>
          ) : null}
          {action.revert ? (
            <Field
              label={t(action.revert.kind === 'restore_budget' ? 'fields.revertRestore' : 'fields.revertSuggest')}
              htmlFor="rule-revert"
              hint={t(action.revert.kind === 'restore_budget' ? 'revertRestoreHint' : 'revertSuggestHint')}
            >
              <Select
                id="rule-revert"
                value={action.revert.hour}
                onChange={(e) => setAction({ ...action, revert: { ...action.revert!, hour: Number(e.target.value) } })}
                className="w-32"
              >
                {REVERT_HOURS.map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, '0')}:00
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <fieldset className="rounded-lg border border-line p-3" data-testid="rule-schedule">
            <label className="flex items-center gap-2 text-small font-medium text-fg">
              <input type="checkbox" checked={schedOn} onChange={(e) => setSchedOn(e.target.checked)} />
              {t('schedule.title')}
            </label>
            {schedOn ? (
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <div className="flex gap-1" role="group" aria-label={t('schedule.days')}>
                  {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                    <Button
                      key={d}
                      kind={days.includes(d) ? 'primary' : 'secondary'}
                      size="s"
                      onClick={() =>
                        setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort((a, b) => a - b))
                      }
                      aria-pressed={days.includes(d)}
                    >
                      {t(`schedule.day.${d}` as never)}
                    </Button>
                  ))}
                </div>
                <Select
                  aria-label={t('schedule.from')}
                  value={startHour}
                  onChange={(e) => setStartHour(Number(e.target.value))}
                  className="w-24"
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, '0')}:00
                    </option>
                  ))}
                </Select>
                <span className="text-small text-fg-secondary">→</span>
                <Select
                  aria-label={t('schedule.to')}
                  value={endHour}
                  onChange={(e) => setEndHour(Number(e.target.value))}
                  className="w-24"
                >
                  {Array.from({ length: 24 }, (_, h) => h + 1).map((h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, '0')}:00
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
            <p className="mt-1 text-caption text-fg-tertiary">{t('schedule.hint')}</p>
          </fieldset>
          <Field label={t('fields.maxPerDay')} htmlFor="rule-maxday" hint={t('maxPerDayHint')}>
            <Input
              id="rule-maxday"
              type="number"
              min={1}
              value={maxPerDay}
              onChange={(e) => setMaxPerDay(e.target.value)}
              className="w-32"
            />
          </Field>
          {error ? <Banner tone="danger">{error}</Banner> : null}
          <div className="flex gap-2">
            <Button kind="secondary" size="m" disabled={pending || !accountId} onClick={runBacktest}>
              {t('runBacktest')}
            </Button>
            <Button kind="primary" size="m" disabled={pending || !accountId || backtest === null} onClick={save}>
              {t('saveShadow')}
            </Button>
          </div>
          <p className="text-small text-fg-secondary">{t('shadowNote')}</p>
        </div>
      </Card>
      {backtest !== null ? (
        <Card data-testid="backtest-result">
          <CardHeader title={t('backtestTitle', { count: backtest.length })} />
          {savings && savings.kind !== 'none' ? (
            <div className="mx-4 mt-3 rounded-lg border border-line bg-subtle px-3 py-2" data-testid="rule-savings">
              <p className="text-body font-semibold text-fg">
                {t(savings.kind === 'saved' ? 'savings.saved' : 'savings.extra', {
                  amount: money(savings.amount, savings.currency),
                  days: savings.days,
                })}
              </p>
              <p className="text-caption text-fg-tertiary">{t('savings.note', { entities: savings.entities })}</p>
            </div>
          ) : null}
          {backtest.length === 0 ? (
            <p className="px-4 py-4 text-body text-fg-secondary">{t('backtestEmpty')}</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>{t('cols.date')}</TH>
                  <TH>{t('cols.item')}</TH>
                  <TH>{t('cols.action')}</TH>
                </TR>
              </THead>
              <TBody>
                {backtest.map((b, i) => (
                  <TR key={i}>
                    <TD muted>{b.date}</TD>
                    <TD>{b.name ?? b.metaId}</TD>
                    <TD muted>
                      {ta(`types.${action.type}` as never)}
                      {b.newDailyBudget ? ` → ${b.newDailyBudget}` : ''}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
          <p className="border-t border-line px-4 py-3 text-small text-fg-secondary">{t('backtestNote')}</p>
        </Card>
      ) : null}
    </div>
  );
}
