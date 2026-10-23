'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button, Field, Input, Segmented, Select } from '@adxlens/ui';
import { api } from '@/lib/api-client';

type Range = { from: string; to: string };

export function NewReportForm({
  clients,
  defaultClient,
  presets,
}: {
  clients: { id: string; name: string; locale: 'vi' | 'en' | null }[];
  defaultClient: string | null;
  presets: Record<'last7' | 'last30' | 'lastMonth', Range>;
}) {
  const t = useTranslations('reports.new');
  const tr = useTranslations('reports');
  const tc = useTranslations('common');
  const router = useRouter();
  const [pending, start] = useTransition();
  const initial = clients.find((c) => c.id === defaultClient) ?? clients[0]!;
  const [clientId, setClientId] = useState(initial.id);
  const [kind, setKind] = useState<'periodic' | 'audit'>('periodic');
  const [preset, setPreset] = useState<'last7' | 'last30' | 'lastMonth' | 'custom'>('last7');
  const [range, setRange] = useState<Range>(presets.last7);
  const [locale, setLocale] = useState<'vi' | 'en'>(initial.locale ?? 'vi');

  const submit = () =>
    start(async () => {
      try {
        const r = await api<{ report_id: string }>('reports', {
          method: 'POST',
          body: { client_id: clientId, kind, date_from: range.from, date_to: range.to, locale },
        });
        router.push(`/reports/${r.report_id}`);
      } catch {
        toast.error(tc('errorGeneric'));
      }
    });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Field label={t('client')} htmlFor="report-client">
        <Select
          id="report-client"
          value={clientId}
          onChange={(e) => {
            setClientId(e.target.value);
            const c = clients.find((x) => x.id === e.target.value);
            if (c?.locale) setLocale(c.locale);
          }}
        >
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t('kind')} hint={t(`kindHelp.${kind}`)}>
        <Segmented
          value={kind}
          onChange={(v) => setKind(v)}
          options={[
            { value: 'periodic', label: tr('kind.periodic') },
            { value: 'audit', label: tr('kind.audit') },
          ]}
        />
      </Field>
      <Field label={t('period')}>
        <Segmented
          value={preset}
          onChange={(v) => {
            setPreset(v);
            if (v !== 'custom') setRange(presets[v]);
          }}
          options={(['last7', 'last30', 'lastMonth', 'custom'] as const).map((p) => ({
            value: p,
            label: t(`presets.${p}`),
          }))}
        />
        {preset === 'custom' ? (
          <div className="mt-2 flex gap-2">
            <Input
              aria-label={t('from')}
              type="date"
              value={range.from}
              onChange={(e) => setRange({ ...range, from: e.target.value })}
            />
            <Input
              aria-label={t('to')}
              type="date"
              value={range.to}
              onChange={(e) => setRange({ ...range, to: e.target.value })}
            />
          </div>
        ) : (
          <p className="mt-1 text-small text-fg-secondary">
            {range.from} → {range.to}
          </p>
        )}
      </Field>
      <Field label={t('locale')} htmlFor="report-locale">
        <Select id="report-locale" value={locale} onChange={(e) => setLocale(e.target.value as 'vi' | 'en')}>
          <option value="vi">{t('locales.vi')}</option>
          <option value="en">{t('locales.en')}</option>
        </Select>
      </Field>
      <div>
        <Button type="submit" kind="primary" size="m" disabled={pending || range.from > range.to}>
          {t('submit')}
        </Button>
      </div>
    </form>
  );
}
