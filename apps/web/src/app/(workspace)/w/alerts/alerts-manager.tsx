'use client';

import { Bell, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  Field,
  Input,
  Select,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@adxlens/ui';
import { api } from '@/lib/api-client';
import { formatMetric, LOWER_IS_BETTER } from '@/lib/metric-format';

type Alert = {
  id: string;
  adAccountId: string | null;
  currency: string | null;
  metric: string;
  condition: 'above' | 'below';
  threshold: string;
  window: '1d' | '7d';
  enabled: boolean;
  lastFiredOn: string | null;
  lastValue: string | null;
};

type Suggestion = { metric: string; condition: 'above' | 'below'; threshold: string; min: string; max: string };

export function AlertsManager(p: {
  openNew: boolean;
  canAll: boolean;
  metrics: readonly string[];
  accounts: { id: string; name: string; currency: string }[];
  mainCurrency: string | null;
  defaultAccountId: string | null;
  hints: Record<string, Record<string, string | null>>;
  suggestions: Suggestion[];
  alerts: Alert[];
}) {
  const t = useTranslations('wsAlerts');
  const tm = useTranslations('metrics');
  const tc = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(p.openNew);
  const [pending, start] = useTransition();
  const [account, setAccount] = useState<string>(p.defaultAccountId ?? (p.canAll ? 'all' : (p.accounts[0]?.id ?? '')));
  const [metric, setMetric] = useState('cpm');
  const [condition, setCondition] = useState<'above' | 'below'>('above');
  const [threshold, setThreshold] = useState('');
  const [window, setWindow] = useState<'1d' | '7d'>('1d');
  const accName = (id: string | null) => (id ? (p.accounts.find((a) => a.id === id)?.name ?? '—') : t('allAccounts'));
  const curOf = (id: string) =>
    id === 'all' ? p.mainCurrency : (p.accounts.find((a) => a.id === id)?.currency ?? null);
  const hint = p.hints[account]?.[metric] ?? null;
  const clean = threshold.trim().replace(',', '.');

  const run = (fn: () => Promise<unknown>, ok: string) =>
    start(async () => {
      try {
        await fn();
        toast.success(ok);
        router.refresh();
      } catch {
        toast.error(t('error'));
      }
    });

  const create = () =>
    run(async () => {
      await api('alerts', {
        method: 'POST',
        body: { adAccountId: account === 'all' ? null : account, metric, condition, threshold: clean, window },
      });
      setOpen(false);
      setThreshold('');
    }, t('created'));

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button kind="primary" size="m" onClick={() => setOpen(true)}>
          <Bell className="size-4" aria-hidden />
          {t('new')}
        </Button>
      </div>

      {p.alerts.length === 0 ? (
        <Card>
          <EmptyState title={t('emptyTitle')} description={t('emptyBody')} />
        </Card>
      ) : (
        <Card className="p-0">
          <Table>
            <THead>
              <tr>
                <TH>{t('cols.alert')}</TH>
                <TH>{t('cols.scope')}</TH>
                <TH>{t('cols.window')}</TH>
                <TH>{t('cols.last')}</TH>
                <TH>{t('cols.status')}</TH>
                <TH className="w-16" />
              </tr>
            </THead>
            <TBody>
              {p.alerts.map((a) => (
                <TR key={a.id}>
                  <TD>
                    {t('rule', {
                      metric: tm(`${a.metric}.name`),
                      cond: a.condition,
                      value: formatMetric(a.metric, a.threshold, a.currency, locale),
                    })}
                  </TD>
                  <TD>{accName(a.adAccountId)}</TD>
                  <TD>{t(`windows.${a.window}`)}</TD>
                  <TD>
                    {a.lastFiredOn
                      ? t('fired', {
                          date: a.lastFiredOn,
                          value: formatMetric(a.metric, a.lastValue, a.currency, locale),
                        })
                      : t('never')}
                  </TD>
                  <TD>
                    <button
                      type="button"
                      onClick={() =>
                        run(
                          () => api(`alerts/${a.id}`, { method: 'PATCH', body: { enabled: !a.enabled } }),
                          a.enabled ? t('paused') : t('resumed'),
                        )
                      }
                      disabled={pending}
                      aria-label={a.enabled ? t('pause') : t('resume')}
                    >
                      <Badge tone={a.enabled ? 'success' : 'neutral'}>{a.enabled ? t('on') : t('off')}</Badge>
                    </button>
                  </TD>
                  <TD className="text-right">
                    <Button
                      kind="ghost"
                      size="s"
                      aria-label={t('delete')}
                      disabled={pending}
                      onClick={() => run(() => api(`alerts/${a.id}`, { method: 'DELETE' }), t('deleted'))}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t('new')}
        description={t('newIntro')}
        closeLabel={tc('close')}
        footer={
          <Button
            kind="primary"
            size="m"
            disabled={pending || !account || !/^\d+(\.\d+)?$/.test(clean)}
            onClick={create}
          >
            {t('save')}
          </Button>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('cols.scope')}>
            <Select value={account} onChange={(e) => setAccount(e.target.value)} aria-label={t('cols.scope')}>
              {p.canAll ? <option value="all">{t('allAccounts')}</option> : null}
              {p.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('metric')}>
            <Select
              value={metric}
              onChange={(e) => {
                setMetric(e.target.value);
                setCondition(LOWER_IS_BETTER.has(e.target.value) || e.target.value === 'spend' ? 'above' : 'below');
              }}
              aria-label={t('metric')}
            >
              {p.metrics.map((m) => (
                <option key={m} value={m}>
                  {tm(`${m}.name`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('condition')}>
            <Select
              value={condition}
              onChange={(e) => setCondition(e.target.value as 'above' | 'below')}
              aria-label={t('condition')}
            >
              <option value="above">{t('above')}</option>
              <option value="below">{t('below')}</option>
            </Select>
          </Field>
          <Field label={t('cols.window')}>
            <Select
              value={window}
              onChange={(e) => setWindow(e.target.value as '1d' | '7d')}
              aria-label={t('cols.window')}
            >
              <option value="1d">{t('windows.1d')}</option>
              <option value="7d">{t('windows.7d')}</option>
            </Select>
          </Field>
          <Field
            label={t('threshold')}
            className="sm:col-span-2"
            hint={hint ? t('avg7', { value: formatMetric(metric, hint, curOf(account), locale) }) : undefined}
          >
            <Input
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              inputMode="decimal"
              aria-label={t('threshold')}
            />
          </Field>
        </div>
        {p.suggestions.length ? (
          <div className="mt-3">
            <p className="text-caption text-fg-tertiary">{t('fromData')}</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {p.suggestions.map((s) => (
                <button
                  key={s.metric}
                  type="button"
                  className="rounded-full border border-line px-2 py-0.5 text-caption text-fg-secondary hover:bg-hover"
                  onClick={() => {
                    setMetric(s.metric);
                    setCondition(s.condition);
                    setThreshold(String(Number(s.threshold)));
                    setWindow('7d');
                  }}
                >
                  {tm(`${s.metric}.name`)} {s.condition === 'above' ? '>' : '<'}{' '}
                  {formatMetric(s.metric, s.threshold, curOf(account), locale)}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
