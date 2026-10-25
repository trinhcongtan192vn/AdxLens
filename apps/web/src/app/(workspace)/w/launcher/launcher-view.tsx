'use client';

import { Rocket, UsersRound } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Banner, Button, Card, Checkbox, cn, Field, Input, Select, Table, TBody, TD, TH, THead, TR } from '@adxlens/ui';
import { api, ApiError } from '@/lib/api-client';
import { formatMetric } from '@/lib/metric-format';

type Creative = {
  creativeId: string;
  name: string | null;
  thumbnailUrl: string | null;
  format: string | null;
  spend: string;
  roas: string | null;
  ctr: number | null;
  results: number;
};

const MAX_CREATIVES = 5;

/** Ad Launcher + Audience Launcher (ADR-0023). Mọi thao tác tạo hành động duyệt tay; quảng cáo mới luôn tạm dừng. */
export function LauncherView({
  adAccountId,
  currency,
  canApprove,
  adsets,
  audiences,
  creatives,
}: {
  adAccountId: string;
  currency: string;
  canApprove: boolean;
  adsets: { metaId: string; name: string | null; status: string | null; campaignName: string | null }[];
  audiences: { metaId: string; name: string | null; subtype: string | null }[];
  creatives: Creative[];
}) {
  const t = useTranslations('wsLauncher');
  const locale = useLocale();
  const [pending, start] = useTransition();
  const [adset, setAdset] = useState(adsets[0]?.metaId ?? '');
  const [picked, setPicked] = useState<string[]>([]);
  const [adName, setAdName] = useState('AdxLens');
  const [origin, setOrigin] = useState(audiences[0]?.metaId ?? '');
  const [country, setCountry] = useState('VN');
  const [ratios, setRatios] = useState<number[]>([1]);
  const [done, setDone] = useState<string[] | null>(null);

  const err = (e: unknown) => {
    const code = e instanceof ApiError ? e.code : 'INTERNAL';
    toast.error(t.has(`errors.${code}`) ? t(`errors.${code}` as never) : t('errors.other'));
  };
  const launchAds = () =>
    start(async () => {
      try {
        const r = await api<{ action_ids: string[] }>('launcher/ads', {
          method: 'POST',
          body: { adAccountId, adsetId: adset, creativeIds: picked, name: adName },
        });
        setDone(r.action_ids);
        setPicked([]);
        toast.success(t('adsQueued', { n: r.action_ids.length }));
      } catch (e) {
        err(e);
      }
    });
  const launchLookalikes = () =>
    start(async () => {
      try {
        const name = audiences.find((a) => a.metaId === origin)?.name ?? 'Lookalike';
        const r = await api<{ action_ids: string[] }>('launcher/lookalikes', {
          method: 'POST',
          body: { adAccountId, originAudienceId: origin, country, ratios, name: `LAL ${name}` },
        });
        setDone(r.action_ids);
        toast.success(t('audiencesQueued', { n: r.action_ids.length }));
      } catch (e) {
        err(e);
      }
    });
  const money = (v: string | null) => formatMetric('spend', v, currency, locale);

  return (
    <div className="flex flex-col gap-4">
      {done?.length ? (
        <div data-testid="launcher-done">
          <Banner tone="success">
            {t('doneBody', { n: done.length })}{' '}
            <a href="/action-log" className="font-medium underline">
              {t('openLog')}
            </a>
          </Banner>
        </div>
      ) : null}

      <Card data-testid="ad-launcher">
        <h2 className="flex items-center gap-2 text-h3 font-semibold text-fg">
          <Rocket className="size-5 text-fg-tertiary" aria-hidden />
          {t('ads.title')}
        </h2>
        <p className="mt-1 text-small text-fg-secondary">{t('ads.intro')}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label={t('ads.adset')} htmlFor="l-adset">
            <Select id="l-adset" value={adset} onChange={(e) => setAdset(e.target.value)}>
              {adsets.map((a) => (
                <option key={a.metaId} value={a.metaId}>
                  {a.name ?? a.metaId}
                  {a.campaignName ? ` · ${a.campaignName}` : ''}
                  {a.status === 'PAUSED' ? ` (${t('paused')})` : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('ads.name')} htmlFor="l-name" hint={t('ads.nameHint')}>
            <Input id="l-name" value={adName} maxLength={150} onChange={(e) => setAdName(e.target.value)} />
          </Field>
        </div>
        <p className="mt-3 text-small font-medium text-fg">{t('ads.pick', { max: MAX_CREATIVES })}</p>
        <div className="mt-1 overflow-x-auto">
          <Table>
            <THead>
              <tr>
                <TH className="w-8" />
                <TH>{t('ads.creative')}</TH>
                <TH numeric>ROAS</TH>
                <TH numeric>{t('ads.spend')}</TH>
                <TH numeric>CTR</TH>
                <TH numeric>{t('ads.results')}</TH>
              </tr>
            </THead>
            <TBody>
              {creatives.map((c) => {
                const on = picked.includes(c.creativeId);
                return (
                  <TR key={c.creativeId} className={cn(on && 'bg-brand-subtle')}>
                    <TD>
                      <Checkbox
                        checked={on}
                        disabled={!on && picked.length >= MAX_CREATIVES}
                        aria-label={t('ads.select', { name: c.name ?? c.creativeId })}
                        onChange={() =>
                          setPicked(on ? picked.filter((x) => x !== c.creativeId) : [...picked, c.creativeId])
                        }
                      />
                    </TD>
                    <TD>
                      <span className="flex items-center gap-2">
                        {c.thumbnailUrl ? (
                          <img src={c.thumbnailUrl} alt="" className="size-8 rounded border border-line object-cover" />
                        ) : null}
                        <span className="text-small text-fg">{c.name ?? c.creativeId}</span>
                      </span>
                    </TD>
                    <TD numeric>{c.roas ?? '—'}</TD>
                    <TD numeric>{money(c.spend)}</TD>
                    <TD numeric>{c.ctr == null ? '—' : `${(c.ctr * 100).toFixed(2)}%`}</TD>
                    <TD numeric>{c.results}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Button
            kind="primary"
            size="m"
            disabled={!canApprove || pending || !adset || !picked.length || !adName.trim()}
            onClick={launchAds}
            data-testid="launch-ads"
          >
            {t('ads.launch', { n: picked.length })}
          </Button>
          <span className="text-caption text-fg-tertiary">{t('ads.note')}</span>
        </div>
      </Card>

      <Card data-testid="audience-launcher">
        <h2 className="flex items-center gap-2 text-h3 font-semibold text-fg">
          <UsersRound className="size-5 text-fg-tertiary" aria-hidden />
          {t('aud.title')}
        </h2>
        <p className="mt-1 text-small text-fg-secondary">{t('aud.intro')}</p>
        {audiences.length === 0 ? (
          <p className="mt-3 text-small text-fg-tertiary">{t('aud.none')}</p>
        ) : (
          <>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Field label={t('aud.origin')} htmlFor="l-origin">
                <Select id="l-origin" value={origin} onChange={(e) => setOrigin(e.target.value)}>
                  {audiences.map((a) => (
                    <option key={a.metaId} value={a.metaId}>
                      {a.name ?? a.metaId}
                      {a.subtype ? ` · ${a.subtype}` : ''}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('aud.country')} htmlFor="l-country" hint={t('aud.countryHint')}>
                <Input
                  id="l-country"
                  value={country}
                  maxLength={2}
                  onChange={(e) => setCountry(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
                />
              </Field>
              <fieldset>
                <legend className="text-small font-medium text-fg-secondary">{t('aud.ratios')}</legend>
                <div className="mt-1 flex flex-wrap gap-2">
                  {[1, 2, 3, 5, 10].map((r) => (
                    <label key={r} className="flex items-center gap-1 text-small">
                      <Checkbox
                        checked={ratios.includes(r)}
                        disabled={!ratios.includes(r) && ratios.length >= 3}
                        onChange={() => setRatios(ratios.includes(r) ? ratios.filter((x) => x !== r) : [...ratios, r])}
                      />
                      {r}%
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <Button
                kind="primary"
                size="m"
                disabled={!canApprove || pending || !origin || country.length !== 2 || !ratios.length}
                onClick={launchLookalikes}
                data-testid="launch-lookalikes"
              >
                {t('aud.launch', { n: ratios.length })}
              </Button>
              <span className="text-caption text-fg-tertiary">{t('aud.note')}</span>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
