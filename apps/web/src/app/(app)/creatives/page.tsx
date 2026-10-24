import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { ClientFilter, clientParam } from '@/components/client-filter';
import { listAdAccounts } from '@adxlens/core/connections';
import { CREATIVE_CLASSES, creativeLibrary, type CreativeClass } from '@adxlens/core/recommendation';
import {
  Badge,
  Button,
  buttonVariants,
  Card,
  cn,
  EmptyState,
  PageHeader,
  Select,
  SourceFootnote,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@adxlens/ui';
import { CLASS_TONE } from '@/lib/creatives';
import { getPageContext, requireFlag } from '@/server/page-context';
import { currentRanges } from '@/server/period';

export async function generateMetadata() {
  const t = await getTranslations('creatives');
  return { title: t('title') };
}

const KNOWN_FORMATS = new Set(['VIDEO', 'PHOTO', 'SHARE', 'STATUS']);

function chip(active: boolean) {
  return cn(
    'inline-flex h-6 items-center gap-1 rounded-full border px-2.5 text-small font-medium',
    active ? 'border-brand bg-brand-subtle text-brand' : 'border-line bg-surface text-fg-secondary hover:bg-hover',
  );
}

/**
 * P103 Creative library (P1-01, P1-03, P1-07): creative gom theo creative gốc của một tài khoản, phân loại
 * có lý do, dự báo mệt (ghi rõ là dự báo). Bảng / lưới; chọn 2–4 creative để so sánh (P104).
 * Sau cờ `p1_recommendations` (kiểm ở server).
 */
export default async function CreativesPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string; view?: string; class?: string; client?: string }>;
}) {
  const pc = await getPageContext();
  await requireFlag(pc, 'p1_recommendations');
  const t = await getTranslations('creatives');
  const format = await getFormatter();
  const q = await searchParams;
  const clientId = clientParam(q.client);
  const accounts = await listAdAccounts(pc.ctx, { clientId });
  const account = accounts.find((a) => a.id === q.account) ?? accounts[0];
  if (!account) {
    return (
      <>
        <PageHeader title={t('title')} />
        <Card>
          <EmptyState title={t('noAccounts')} description={t('noAccountsBody')} />
        </Card>
      </>
    );
  }
  const view = q.view === 'grid' ? 'grid' : 'table';
  const filter = (CREATIVE_CLASSES as readonly string[]).includes(q.class ?? '') ? (q.class as CreativeClass) : null;
  const { cur } = await currentRanges(account.timezone);
  const all = await creativeLibrary(pc.ctx, account.id, cur);
  const rows = filter ? all.filter((r) => r.class === filter) : all;
  const counts = Object.fromEntries(CREATIVE_CLASSES.map((c) => [c, all.filter((r) => r.class === c).length]));
  const money = (v: string | null) =>
    v === null ? '—' : format.number(Number(v), { maximumFractionDigits: account.currency === 'VND' ? 0 : 2 });
  const pct = (v: number | null) =>
    v === null ? '—' : format.number(v, { style: 'percent', maximumFractionDigits: 2 });
  const href = (p: Record<string, string | null>) => {
    const s = new URLSearchParams({
      account: account.id,
      view,
      ...(filter ? { class: filter } : {}),
      ...(clientId ? { client: clientId } : {}),
    });
    for (const [k, v] of Object.entries(p)) {
      if (v === null) s.delete(k);
      else s.set(k, v);
    }
    return `/creatives?${s}`;
  };
  const reason = (r: (typeof rows)[number]) => t(`reasons.${r.reason.key}` as never, r.reason.params as never);
  const thumb = (url: string | null, cls: string) =>
    url ? (
      <img src={url} alt="" className={cn('rounded-md border border-line object-cover', cls)} />
    ) : (
      <span className={cn('rounded-md border border-line bg-subtle', cls)} aria-hidden />
    );

  return (
    <>
      <PageHeader
        title={t('title')}
        actions={
          <form method="get" className="flex items-center gap-2">
            <input type="hidden" name="view" value={view} />
            {clientId ? <input type="hidden" name="client" value={clientId} /> : null}
            <Select name="account" defaultValue={account.id} aria-label={t('account')} className="w-auto">
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
            <Button kind="secondary" size="s" type="submit">
              {t('apply')}
            </Button>
          </form>
        }
      />
      <ClientFilter ctx={pc.ctx} clientId={clientId} clearHref="/creatives" />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link href={href({ class: null })} className={chip(!filter)}>
          {t('all')} · {all.length}
        </Link>
        {CREATIVE_CLASSES.map((c) => (
          <Link key={c} href={href({ class: c })} className={chip(filter === c)}>
            {t(`classes.${c}`)} · {counts[c]}
          </Link>
        ))}
        <div className="flex-1" />
        <Link href={href({ view: 'table' })} className={chip(view === 'table')}>
          {t('viewTable')}
        </Link>
        <Link href={href({ view: 'grid' })} className={chip(view === 'grid')}>
          {t('viewGrid')}
        </Link>
      </div>
      {rows.length === 0 ? (
        <Card>
          <EmptyState title={t('empty')} description={t('emptyBody')} />
        </Card>
      ) : (
        <form method="get" action="/creatives/compare">
          <input type="hidden" name="account" value={account.id} />
          {view === 'table' ? (
            <Card>
              <Table>
                <THead>
                  <TR>
                    <TH className="w-8">
                      <span className="sr-only">{t('select')}</span>
                    </TH>
                    <TH>{t('creative')}</TH>
                    <TH>{t('class')}</TH>
                    <TH numeric>{t('spend')}</TH>
                    <TH numeric>{t('results')}</TH>
                    <TH numeric>{t('cpa')}</TH>
                    <TH numeric>{t('ctr')}</TH>
                    <TH numeric>{t('frequency')}</TH>
                    <TH>{t('runTime')}</TH>
                  </TR>
                </THead>
                <TBody>
                  {rows.map((r) => (
                    <TR key={r.key}>
                      <TD>
                        <input
                          type="checkbox"
                          name="ids"
                          value={r.creativeId}
                          aria-label={t('selectOne', { name: r.name ?? r.creativeId })}
                        />
                      </TD>
                      <TD>
                        <div className="flex items-center gap-2">
                          {thumb(r.thumbnailUrl, 'size-10')}
                          <div>
                            <div className="font-medium text-fg">{r.name ?? r.creativeId}</div>
                            <div className="text-small text-fg-secondary">
                              {r.format
                                ? KNOWN_FORMATS.has(r.format)
                                  ? t(`formats.${r.format}` as never)
                                  : r.format
                                : '—'}{' '}
                              · {t('ads', { count: r.adCount })}
                            </div>
                          </div>
                        </div>
                      </TD>
                      <TD>
                        <div className="flex flex-col gap-1">
                          <Badge tone={CLASS_TONE[r.class]} title={reason(r)} data-testid="creative-class">
                            {t(`classes.${r.class}`)}
                          </Badge>
                          <span className="text-small text-fg-secondary">{reason(r)}</span>
                          {r.forecast ? (
                            <span className="text-small text-warning">{t('forecast', { days: r.forecast.days })}</span>
                          ) : null}
                        </div>
                      </TD>
                      <TD numeric>{money(r.metrics.spend)}</TD>
                      <TD numeric>{format.number(r.metrics.results)}</TD>
                      <TD numeric>{money(r.metrics.cpa)}</TD>
                      <TD numeric>{pct(r.metrics.ctr)}</TD>
                      <TD numeric>
                        {r.metrics.frequency === null
                          ? '—'
                          : format.number(r.metrics.frequency, { maximumFractionDigits: 2 })}
                      </TD>
                      <TD muted>
                        {r.firstDate && r.lastDate ? `${r.firstDate.slice(5)} → ${r.lastDate.slice(5)}` : '—'}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {rows.map((r) => (
                <Card key={r.key} className="flex flex-col gap-2 p-3">
                  {thumb(r.thumbnailUrl, 'aspect-square w-full')}
                  <label className="flex items-start gap-2">
                    <input type="checkbox" name="ids" value={r.creativeId} className="mt-1" />
                    <span className="font-medium text-fg">{r.name ?? r.creativeId}</span>
                  </label>
                  <Badge tone={CLASS_TONE[r.class]} className="self-start">
                    {t(`classes.${r.class}`)}
                  </Badge>
                  <p className="text-small text-fg-secondary">{reason(r)}</p>
                  {r.forecast ? (
                    <p className="text-small text-warning">{t('forecast', { days: r.forecast.days })}</p>
                  ) : null}
                  <p className="num text-small text-fg">
                    {t('spend')}: {money(r.metrics.spend)} · {t('cpa')}: {money(r.metrics.cpa)} · {t('ctr')}:{' '}
                    {pct(r.metrics.ctr)}
                  </p>
                </Card>
              ))}
            </div>
          )}
          <div className="mt-3 flex items-center gap-3">
            <button type="submit" className={buttonVariants({ kind: 'primary', size: 'm' })}>
              {t('compare')}
            </button>
            <span className="text-small text-fg-secondary">{t('compareHint')}</span>
          </div>
        </form>
      )}
      <SourceFootnote className="mt-4">{t('footnote', { from: cur.from, to: cur.to })}</SourceFootnote>
    </>
  );
}
