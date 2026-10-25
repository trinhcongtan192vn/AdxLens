'use client';

import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button, Card, cn, Field, Input, Select } from '@adxlens/ui';
import { api } from '@/lib/api-client';
import { formatMetric } from '@/lib/metric-format';

type Values = Record<string, string | null>;
type Asset = { kind: string; metaId: string; name: string; parentId: string | null };

export type WizardProps = {
  clientId: string;
  clientName: string;
  canManage: boolean;
  metrics: readonly string[];
  industries: Record<string, readonly string[]>;
  suggestions: { currency: string | null; mixedCurrency: boolean; yesterday: Values; last7: Values; last30: Values };
  assets: Asset[];
  initial: {
    primaryMetric: string | null;
    primaryTarget: string | null;
    secondaryMetrics: string[];
    industry: string | null;
    subIndustry: string | null;
    defaultPageId: string | null;
    defaultInstagramId: string | null;
    defaultPixelId: string | null;
  };
};

/** ADR-0017: onboarding 3 bước theo Client (như Madgicx): mục tiêu chính → chỉ số phụ → ngành và tài sản. */
export function OnboardingWizard(p: WizardProps) {
  const t = useTranslations('goals');
  const tm = useTranslations('metrics');
  const ti = useTranslations('industries');
  const locale = useLocale();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pending, start] = useTransition();
  const [primary, setPrimary] = useState(p.initial.primaryMetric ?? 'cpa');
  const [target, setTarget] = useState(p.initial.primaryTarget ? String(Number(p.initial.primaryTarget)) : '');
  const [secondary, setSecondary] = useState<string[]>(p.initial.secondaryMetrics);
  const [industry, setIndustry] = useState(p.initial.industry ?? '');
  const [sub, setSub] = useState(p.initial.subIndustry ?? '');
  const [page, setPage] = useState(p.initial.defaultPageId ?? '');
  const [ig, setIg] = useState(p.initial.defaultInstagramId ?? '');
  const [pixel, setPixel] = useState(p.initial.defaultPixelId ?? '');
  const fmt = (k: string, v: string | null | undefined) => formatMetric(k, v, p.suggestions.currency, locale);
  const s = p.suggestions;

  const save = (body: Record<string, unknown>, then: () => void) =>
    start(async () => {
      try {
        await api(`clients/${p.clientId}/goal`, { method: 'PUT', body });
        then();
      } catch {
        toast.error(t('saveError'));
      }
    });

  const finish = (complete: Record<string, unknown>) =>
    save({ ...complete, complete: true }, () => {
      toast.success(t('saved'));
      router.push(`/clients/${p.clientId}?tab=goals`);
      router.refresh();
    });

  const steps = [t('step1'), t('step2'), t('step3')];
  const cleanTarget = target.trim().replace(',', '.');

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <ol className="flex flex-row gap-2 lg:flex-col" aria-label={t('stepsLabel')}>
        {steps.map((label, i) => (
          <li
            key={label}
            aria-current={i === step ? 'step' : undefined}
            className={cn(
              'flex items-center gap-2 rounded-lg px-3 py-2 text-small',
              i === step
                ? 'bg-brand-subtle font-semibold text-fg'
                : i < step
                  ? 'text-fg-secondary'
                  : 'text-fg-tertiary',
            )}
          >
            <span
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-caption',
                i <= step ? 'bg-brand text-on-brand' : 'bg-subtle text-fg-tertiary',
              )}
            >
              {i + 1}
            </span>
            <span className="hidden sm:inline">{label}</span>
          </li>
        ))}
      </ol>

      <Card>
        {step === 0 ? (
          <>
            <h2 className="text-h3 font-semibold text-fg">{t('primaryTitle')}</h2>
            <p className="mt-1 text-small text-fg-secondary">{t('primaryIntro', { client: p.clientName })}</p>
            {s.mixedCurrency ? (
              <p className="mt-2 text-small text-warning">{t('mixedCurrency', { currency: s.currency ?? '' })}</p>
            ) : null}
            <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_280px]">
              <div role="radiogroup" aria-label={t('primaryTitle')} className="grid gap-2 sm:grid-cols-2">
                {p.metrics.map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={primary === m}
                    onClick={() => {
                      setPrimary(m);
                      setTarget('');
                      setSecondary((x) => x.filter((y) => y !== m));
                    }}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-left transition-colors',
                      primary === m ? 'border-brand bg-brand-subtle' : 'border-line hover:bg-hover',
                    )}
                  >
                    <span className="block text-body font-medium text-fg">{tm(`${m}.name`)}</span>
                    <span className="block text-caption text-fg-tertiary">
                      {t('last30Short')}: {fmt(m, s.last30[m])}
                    </span>
                  </button>
                ))}
              </div>
              <div className="rounded-lg bg-subtle px-4 py-3">
                <p className="text-small font-semibold text-fg">
                  {t('actualTitle', { metric: tm(`${primary}.name`) })}
                </p>
                <p className="mt-1 text-caption text-fg-tertiary">{tm(`${primary}.hint`)}</p>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                  {(['yesterday', 'last7', 'last30'] as const).map((k) => (
                    <div key={k}>
                      <dt className="text-caption text-fg-tertiary">{t(`period.${k}`)}</dt>
                      <dd className="num text-body font-semibold text-fg">{fmt(primary, s[k][primary])}</dd>
                    </div>
                  ))}
                </dl>
                <Field label={t('targetLabel')} className="mt-4">
                  <Input
                    inputMode="decimal"
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    placeholder={s.last7[primary] ? String(Number(s.last7[primary])) : ''}
                    aria-label={t('targetLabel')}
                  />
                </Field>
                {s.last7[primary] ? (
                  <button
                    type="button"
                    className="mt-2 text-caption text-link hover:underline"
                    onClick={() => setTarget(String(Number(s.last7[primary])))}
                  >
                    {t('useLast7', { value: fmt(primary, s.last7[primary]) })}
                  </button>
                ) : null}
              </div>
            </div>
          </>
        ) : step === 1 ? (
          <>
            <h2 className="text-h3 font-semibold text-fg">{t('secondaryTitle')}</h2>
            <p className="mt-1 text-small text-fg-secondary">{t('secondaryIntro')}</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {p.metrics
                .filter((m) => m !== primary)
                .map((m) => {
                  const on = secondary.includes(m);
                  const disabled = !on && secondary.length >= 2;
                  return (
                    <button
                      key={m}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      disabled={disabled}
                      onClick={() => setSecondary((x) => (on ? x.filter((y) => y !== m) : [...x, m]))}
                      className={cn(
                        'rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-50',
                        on ? 'border-brand bg-brand-subtle' : 'border-line hover:bg-hover',
                      )}
                    >
                      <span className="block text-body font-medium text-fg">{tm(`${m}.name`)}</span>
                      <span className="block text-caption text-fg-tertiary">
                        {t('range30', { value: fmt(m, s.last30[m]) })}
                      </span>
                    </button>
                  );
                })}
            </div>
            <p className="mt-2 text-caption text-fg-tertiary">{t('secondaryCount', { n: secondary.length })}</p>
          </>
        ) : (
          <>
            <h2 className="text-h3 font-semibold text-fg">{t('assetsTitle')}</h2>
            <p className="mt-1 text-small text-fg-secondary">{t('assetsIntro')}</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label={t('industry')}>
                <Select
                  value={industry}
                  onChange={(e) => {
                    setIndustry(e.target.value);
                    setSub('');
                  }}
                  aria-label={t('industry')}
                >
                  <option value="">{t('choose')}</option>
                  {Object.keys(p.industries).map((k) => (
                    <option key={k} value={k}>
                      {ti(`${k}.name`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('subIndustry')}>
                <Select
                  value={sub}
                  onChange={(e) => setSub(e.target.value)}
                  disabled={!industry}
                  aria-label={t('subIndustry')}
                >
                  <option value="">{t('choose')}</option>
                  {(p.industries[industry] ?? []).map((k) => (
                    <option key={k} value={k}>
                      {ti(`${industry}.${k}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <AssetSelect
                label={t('page')}
                kind="page"
                value={page}
                onChange={setPage}
                assets={p.assets}
                none={t('noAsset')}
              />
              <AssetSelect
                label={t('instagram')}
                kind="instagram"
                value={ig}
                onChange={setIg}
                assets={p.assets}
                none={t('noAsset')}
              />
              <AssetSelect
                label={t('pixel')}
                kind="pixel"
                value={pixel}
                onChange={setPixel}
                assets={p.assets}
                none={t('noAsset')}
              />
            </div>
          </>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
          <Button kind="ghost" size="m" disabled={pending || !p.canManage} onClick={() => finish({})}>
            {t('later')}
          </Button>
          <div className="flex gap-2">
            {step > 0 ? (
              <Button kind="secondary" size="m" disabled={pending} onClick={() => setStep(step - 1)}>
                {t('back')}
              </Button>
            ) : null}
            {step === 0 ? (
              <Button
                kind="primary"
                size="m"
                disabled={pending || !p.canManage || !/^\d+(\.\d+)?$/.test(cleanTarget) || Number(cleanTarget) <= 0}
                onClick={() => save({ primaryMetric: primary, primaryTarget: cleanTarget }, () => setStep(1))}
              >
                {t('next')}
              </Button>
            ) : step === 1 ? (
              <Button
                kind="primary"
                size="m"
                disabled={pending || !p.canManage}
                onClick={() => save({ secondaryMetrics: secondary }, () => setStep(2))}
              >
                {t('next')}
              </Button>
            ) : (
              <Button
                kind="primary"
                size="m"
                disabled={pending || !p.canManage || (Boolean(industry) && !sub)}
                onClick={() =>
                  finish({
                    industry: industry || null,
                    subIndustry: sub || null,
                    defaultPageId: page || null,
                    defaultInstagramId: ig || null,
                    defaultPixelId: pixel || null,
                  })
                }
              >
                {t('finish')}
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

function AssetSelect(props: {
  label: string;
  kind: string;
  value: string;
  onChange: (v: string) => void;
  assets: Asset[];
  none: string;
}) {
  const list = props.assets.filter((a) => a.kind === props.kind);
  return (
    <Field label={props.label}>
      <Select value={props.value} onChange={(e) => props.onChange(e.target.value)} aria-label={props.label}>
        <option value="">{props.none}</option>
        {list.map((a) => (
          <option key={a.metaId} value={a.metaId}>
            {a.name}
          </option>
        ))}
      </Select>
    </Field>
  );
}
