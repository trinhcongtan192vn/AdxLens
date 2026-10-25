'use client';

import { Target } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Banner, Button, Card, Field, Input, Segmented, Select } from '@adxlens/ui';
import { api, ApiError } from '@/lib/api-client';

type Asset = { metaId: string; name: string };
type SourceType = 'pixel' | 'page' | 'ig_business';
const EVENTS = ['all', 'PageView', 'ViewContent', 'AddToCart', 'InitiateCheckout', 'Purchase', 'Lead'] as const;

/**
 * ADR-0026: custom audience từ pixel (sự kiện website, 1–180 ngày) hoặc tương tác Page / Instagram (1–365 ngày). Nguồn
 * là tài sản đã đồng bộ (pixel của đúng tài khoản QC). Tạo qua Execution Gateway, duyệt tay; xem ở Nhật ký hành động.
 */
export function CustomAudienceCard({
  adAccountId,
  canApprove,
  pixels,
  pages,
  instagram,
  namePrefix,
}: {
  adAccountId: string;
  canApprove: boolean;
  pixels: Asset[];
  pages: Asset[];
  instagram: Asset[];
  namePrefix: string | null;
}) {
  const t = useTranslations('wsLauncher.custom');
  const tl = useTranslations('wsLauncher');
  const available: SourceType[] = [
    ...(pixels.length ? (['pixel'] as const) : []),
    ...(pages.length ? (['page'] as const) : []),
    ...(instagram.length ? (['ig_business'] as const) : []),
  ];
  const [type, setType] = useState<SourceType>(available[0] ?? 'pixel');
  const list = type === 'pixel' ? pixels : type === 'page' ? pages : instagram;
  const [sourceId, setSourceId] = useState(list[0]?.metaId ?? '');
  const [event, setEvent] = useState<(typeof EVENTS)[number]>('AddToCart');
  const [days, setDays] = useState('30');
  const [name, setName] = useState('');
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const max = type === 'pixel' ? 180 : 365;
  const n = Number(days);
  const validDays = Number.isInteger(n) && n >= 1 && n <= max;
  const source = list.find((x) => x.metaId === sourceId) ?? list[0];
  const autoName = [
    namePrefix,
    type === 'pixel' ? t(`events.${event}`) : t(`types.${type}`),
    source?.name,
    t('daysShort', { n: validDays ? n : 0 }),
  ]
    .filter(Boolean)
    .join(' · ');

  const pick = (x: SourceType) => {
    setType(x);
    const l = x === 'pixel' ? pixels : x === 'page' ? pages : instagram;
    setSourceId(l[0]?.metaId ?? '');
    if (x !== 'pixel' && n > 365) setDays('365');
    if (x === 'pixel' && n > 180) setDays('180');
  };
  const submit = () =>
    start(async () => {
      try {
        await api('launcher/audiences', {
          method: 'POST',
          body: {
            adAccountId,
            name: (name.trim() || autoName).slice(0, 150),
            source:
              type === 'pixel' ? { type, id: source!.metaId, event, days: n } : { type, id: source!.metaId, days: n },
          },
        });
        setDone(true);
        toast.success(t('queued'));
      } catch (e) {
        const code = e instanceof ApiError ? e.code : 'INTERNAL';
        toast.error(tl.has(`errors.${code}`) ? tl(`errors.${code}` as never) : tl('errors.other'));
      }
    });

  return (
    <Card data-testid="custom-audience-launcher">
      <h2 className="flex items-center gap-2 text-h3 font-semibold text-fg">
        <Target className="size-5 text-fg-tertiary" aria-hidden />
        {t('title')}
      </h2>
      <p className="mt-1 text-small text-fg-secondary">{t('intro')}</p>
      {!available.length ? (
        <p className="mt-3 text-small text-fg-tertiary">{t('none')}</p>
      ) : (
        <>
          <div className="mt-3">
            <Segmented
              value={type}
              onChange={pick}
              options={available.map((x) => ({ value: x, label: t(`types.${x}`) }))}
            />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label={t(`source.${type}`)} htmlFor="ca-source">
              <Select id="ca-source" value={source?.metaId ?? ''} onChange={(e) => setSourceId(e.target.value)}>
                {list.map((a) => (
                  <option key={a.metaId} value={a.metaId}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            {type === 'pixel' ? (
              <Field label={t('event')} htmlFor="ca-event">
                <Select
                  id="ca-event"
                  value={event}
                  onChange={(e) => setEvent(e.target.value as (typeof EVENTS)[number])}
                >
                  {EVENTS.map((x) => (
                    <option key={x} value={x}>
                      {t(`events.${x}`)}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <Field label={t('days', { max })} htmlFor="ca-days">
              <Input id="ca-days" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.trim())} />
            </Field>
          </div>
          <Field label={t('name')} htmlFor="ca-name" className="mt-3">
            <Input
              id="ca-name"
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
              disabled={!canApprove || pending || !source || !validDays}
              onClick={submit}
              data-testid="launch-custom-audience"
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
