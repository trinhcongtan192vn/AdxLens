'use client';

import { Layers } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Banner, Button, Card, Checkbox, Field, Input, Select } from '@adxlens/ui';
import { api, ApiError } from '@/lib/api-client';
import { formatMetric } from '@/lib/metric-format';

type Template = { metaId: string; name: string | null; campaignName: string | null; dailyBudget: string | null };
type Audience = { metaId: string; name: string | null; subtype: string | null };

/**
 * ADR-0026: nhóm QC mới (luôn PAUSED) trong chiến dịch của một nhóm QC mẫu — thiết lập tối ưu / giá thầu chép từ mẫu;
 * người dùng chọn tên, quốc gia, độ tuổi, audience, ngân sách ngày (≤ mẫu + ngưỡng guardrail, máy chủ kiểm lại).
 */
export function NewAdSetCard({
  adAccountId,
  currency,
  canApprove,
  templates,
  audiences,
  namePrefix,
}: {
  adAccountId: string;
  currency: string;
  canApprove: boolean;
  templates: Template[];
  audiences: Audience[];
  namePrefix: string | null;
}) {
  const t = useTranslations('wsLauncher.adset');
  const tl = useTranslations('wsLauncher');
  const locale = useLocale() as 'vi' | 'en';
  const [tplId, setTplId] = useState(templates[0]?.metaId ?? '');
  const tpl = templates.find((x) => x.metaId === tplId) ?? templates[0];
  const [budget, setBudget] = useState(tpl?.dailyBudget ? String(Number(tpl.dailyBudget)) : '');
  const [countries, setCountries] = useState('VN');
  const [ageMin, setAgeMin] = useState('18');
  const [ageMax, setAgeMax] = useState('65');
  const [picked, setPicked] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const list = countries
    .split(/[\s,]+/)
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
  const autoName = [namePrefix, tpl?.campaignName, list.join('+'), `${ageMin}-${ageMax}`].filter(Boolean).join(' · ');
  const valid =
    !!tpl &&
    list.length > 0 &&
    list.every((c) => /^[A-Z]{2}$/.test(c)) &&
    Number(ageMin) >= 18 &&
    Number(ageMax) <= 65 &&
    Number(ageMin) <= Number(ageMax) &&
    (!tpl.dailyBudget || /^\d+(\.\d{1,2})?$/.test(budget));

  const choose = (id: string) => {
    setTplId(id);
    const x = templates.find((y) => y.metaId === id);
    setBudget(x?.dailyBudget ? String(Number(x.dailyBudget)) : '');
  };
  const submit = () =>
    start(async () => {
      try {
        await api('launcher/adsets', {
          method: 'POST',
          body: {
            adAccountId,
            templateAdsetId: tpl!.metaId,
            name: (name.trim() || autoName).slice(0, 150),
            dailyBudget: tpl!.dailyBudget ? budget : null,
            countries: list,
            ageMin: Number(ageMin),
            ageMax: Number(ageMax),
            audienceIds: picked,
          },
        });
        setDone(true);
        toast.success(t('queued'));
      } catch (e) {
        const code = e instanceof ApiError ? e.code : 'INTERNAL';
        toast.error(
          e instanceof ApiError && code === 'GUARDRAIL_VIOLATION'
            ? t('tooLarge')
            : tl.has(`errors.${code}`)
              ? tl(`errors.${code}` as never)
              : tl('errors.other'),
        );
      }
    });

  return (
    <Card data-testid="new-adset-launcher">
      <h2 className="flex items-center gap-2 text-h3 font-semibold text-fg">
        <Layers className="size-5 text-fg-tertiary" aria-hidden />
        {t('title')}
      </h2>
      <p className="mt-1 text-small text-fg-secondary">{t('intro')}</p>
      {!templates.length ? (
        <p className="mt-3 text-small text-fg-tertiary">{t('none')}</p>
      ) : (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label={t('template')} htmlFor="na-tpl" hint={t('templateHint')}>
              <Select id="na-tpl" value={tpl?.metaId ?? ''} onChange={(e) => choose(e.target.value)}>
                {templates.map((x) => (
                  <option key={x.metaId} value={x.metaId}>
                    {x.campaignName ? `${x.campaignName} › ` : ''}
                    {x.name ?? x.metaId}
                  </option>
                ))}
              </Select>
            </Field>
            {tpl?.dailyBudget ? (
              <Field
                label={t('budget')}
                htmlFor="na-budget"
                hint={t('budgetHint', { amount: formatMetric('spend', tpl.dailyBudget, currency, locale) })}
              >
                <Input
                  id="na-budget"
                  inputMode="decimal"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value.trim())}
                />
              </Field>
            ) : (
              <p className="self-end text-small text-fg-tertiary">{t('cbo')}</p>
            )}
            <Field label={t('countries')} htmlFor="na-countries" hint={t('countriesHint')}>
              <Input id="na-countries" value={countries} onChange={(e) => setCountries(e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label={t('ageMin')} htmlFor="na-amin">
                <Input id="na-amin" inputMode="numeric" value={ageMin} onChange={(e) => setAgeMin(e.target.value)} />
              </Field>
              <Field label={t('ageMax')} htmlFor="na-amax">
                <Input id="na-amax" inputMode="numeric" value={ageMax} onChange={(e) => setAgeMax(e.target.value)} />
              </Field>
            </div>
          </div>
          {audiences.length ? (
            <fieldset className="mt-3">
              <legend className="text-small font-medium text-fg-secondary">{t('audiences')}</legend>
              <div className="mt-1 flex max-h-40 flex-col gap-1 overflow-y-auto">
                {audiences.map((a) => (
                  <label key={a.metaId} className="flex items-center gap-2 text-small">
                    <Checkbox
                      checked={picked.includes(a.metaId)}
                      disabled={!picked.includes(a.metaId) && picked.length >= 10}
                      onChange={() =>
                        setPicked(
                          picked.includes(a.metaId) ? picked.filter((x) => x !== a.metaId) : [...picked, a.metaId],
                        )
                      }
                    />
                    {a.name ?? a.metaId}
                    {a.subtype ? <span className="text-caption text-fg-tertiary">{a.subtype}</span> : null}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
          <Field label={t('name')} htmlFor="na-name" className="mt-3">
            <Input
              id="na-name"
              value={name}
              placeholder={autoName}
              maxLength={150}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <div className="mt-3 flex items-center gap-3">
            <Button
              kind="primary"
              size="m"
              disabled={!canApprove || pending || !valid}
              onClick={submit}
              data-testid="launch-adset"
            >
              {t('launch')}
            </Button>
            <span className="text-caption text-fg-tertiary">{t('note')}</span>
          </div>
          {done ? (
            <Banner tone="success" className="mt-3">
              {t('queued')}{' '}
              <a href="/action-log" className="font-medium underline">
                {tl('openLog')}
              </a>
            </Banner>
          ) : null}
        </>
      )}
    </Card>
  );
}
