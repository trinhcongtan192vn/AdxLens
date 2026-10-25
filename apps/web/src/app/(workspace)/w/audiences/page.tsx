import { getLocale, getTranslations } from 'next-intl/server';
import { interestSuggestions, topAudiences } from '@adxlens/core/reporting';
import { Badge, Card, EmptyState, Table, TBody, TD, TH, THead, TR } from '@adxlens/ui';
import { WsHeader } from '@/components/workspace/ws-header';
import { formatMetric } from '@/lib/metric-format';
import { getPageContext } from '@/server/page-context';
import { workspaceScope } from '@/server/workspace-scope';

export async function generateMetadata() {
  const t = await getTranslations('ws');
  return { title: t('nav.audiences') };
}

const TONE = { lookalike: 'info', custom: 'success', interest: 'warning', broad: 'neutral' } as const;

/** Top Audiences (Madgicx Audience Studio): xếp hạng audience theo số của các nhóm QC dùng audience đó. */
export default async function AudiencesPage() {
  const pc = await getPageContext();
  const scope = await workspaceScope(pc);
  const t = await getTranslations('wsAudiences');
  const tw = await getTranslations('ws');
  const locale = await getLocale();
  const [{ rows, adsetsWithoutData }, interests] = await Promise.all([
    topAudiences(pc.ctx, scope.ids, scope.cur),
    interestSuggestions(pc.ctx, scope.ids),
  ]);
  const n = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 });
  const money = (v: string | null) => formatMetric('spend', v, scope.currency, locale);
  return (
    <>
      <WsHeader
        title={tw('nav.audiences')}
        subtitle={t('subtitle')}
        accounts={scope.accounts}
        selectedId={scope.selected?.id ?? null}
        period={scope.period}
      />
      {rows.length === 0 ? (
        <Card>
          <EmptyState title={t('emptyTitle')} description={t('emptyBody')} />
        </Card>
      ) : (
        <>
          <Card className="overflow-x-auto p-0">
            <Table data-testid="audiences-table">
              <THead>
                <tr>
                  <TH>{t('audience')}</TH>
                  <TH>{t('type')}</TH>
                  <TH numeric>{t('adsets')}</TH>
                  <TH numeric>{t('spend')}</TH>
                  <TH numeric>{t('results')}</TH>
                  <TH numeric>{t('cpa')}</TH>
                  <TH numeric>ROAS</TH>
                  <TH numeric>CTR</TH>
                </tr>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.key}>
                    <TD>{r.type === 'broad' ? t('broad') : (r.name ?? r.key)}</TD>
                    <TD>
                      <Badge tone={TONE[r.type]}>{t(`types.${r.type}`)}</Badge>
                    </TD>
                    <TD numeric>{r.adsets}</TD>
                    <TD numeric>{money(r.spend)}</TD>
                    <TD numeric>{r.results}</TD>
                    <TD numeric>{money(r.cpa)}</TD>
                    <TD numeric>{r.roas ?? '—'}</TD>
                    <TD numeric>{r.ctr == null ? '—' : `${r.ctr}%`}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
          <p className="mt-2 text-caption text-fg-tertiary">
            {t('note')}
            {adsetsWithoutData ? ` ${t('noData', { n: adsetsWithoutData })}` : ''}
          </p>
        </>
      )}
      {interests.length ? (
        <Card className="mt-4 overflow-x-auto p-0" data-testid="interest-suggestions">
          <div className="px-4 pt-3">
            <h2 className="text-h4 font-semibold text-fg">{t('discover.title')}</h2>
            <p className="text-caption text-fg-tertiary">{t('discover.intro')}</p>
          </div>
          <Table className="mt-2">
            <THead>
              <tr>
                <TH>{t('discover.interest')}</TH>
                <TH>{t('discover.path')}</TH>
                <TH numeric>{t('discover.size')}</TH>
                <TH>{t('discover.from')}</TH>
              </tr>
            </THead>
            <TBody>
              {interests.map((x) => (
                <TR key={x.metaId}>
                  <TD>{x.name ?? x.metaId}</TD>
                  <TD muted>{x.path.join(' › ') || '—'}</TD>
                  <TD numeric>
                    {x.audienceLow != null && x.audienceHigh != null
                      ? `${n.format(x.audienceLow)} – ${n.format(x.audienceHigh)}`
                      : '—'}
                  </TD>
                  <TD muted>{x.from.join(', ') || '—'}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <p className="px-4 py-2 text-caption text-fg-tertiary">{t('discover.note')}</p>
        </Card>
      ) : null}
    </>
  );
}
