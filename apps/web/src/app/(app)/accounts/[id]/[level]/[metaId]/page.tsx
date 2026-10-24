import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { adsManagerLink } from '@adxlens/core/insight';
import {
  CHILD_LEVEL,
  childRows,
  entityBreakdown,
  entityCpaChange,
  entityDaily,
  entityFindings,
  entityHistory,
  entityInfo,
  entityKpis,
  type EntityLevel,
} from '@adxlens/core/reporting';
import { isAppError } from '@adxlens/core/shared';
import { canApproveActions } from '@adxlens/core/tenancy';
import {
  Badge,
  buttonVariants,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  TabBar,
  tabItemClass,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@adxlens/ui';
import { EntityGrid } from '@/components/entity-grid';
import { KpiRow } from '@/components/kpi-row';
import { TrendChart } from '@/components/trend-chart';
import { describeChange } from '@/lib/actions';
import { BreakdownList, breakdownLabel, CpaChangeBlock } from '@/report/report-view';
import { entityHref, toGridRows } from '@/server/grid';
import { getPageContext } from '@/server/page-context';
import { currentRanges } from '@/server/period';
import { translateText } from '@/server/translate';

const LEVELS = ['campaign', 'adset', 'ad'] as const;
const TABS = ['overview', 'children', 'findings', 'history'] as const;
type Tab = (typeof TABS)[number];

export async function generateMetadata() {
  const t = await getTranslations('entity');
  return { title: t('title') };
}

/**
 * G2: trang của MỘT chiến dịch / nhóm QC / quảng cáo (như Google Ads): đường dẫn phạm vi, số liệu + so kỳ trước, xu
 * hướng, "vì sao CPA thay đổi" của chính đối tượng (con đóng góp nhiều nhất), nhóm đối tượng / vị trí / khu vực, con
 * trực tiếp, vấn đề, lịch sử thay đổi qua AdxLens. Mọi dữ liệu lọc theo đúng đối tượng.
 */
export default async function EntityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; level: string; metaId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const p = await params;
  if (!LEVELS.includes(p.level as EntityLevel)) notFound();
  const level = p.level as EntityLevel;
  const metaId = decodeURIComponent(p.metaId);
  const pc = await getPageContext();
  const info = await entityInfo(pc.ctx, p.id, level, metaId).catch((e) => {
    if (isAppError(e) && e.code === 'NOT_FOUND') notFound();
    throw e;
  });
  const child = CHILD_LEVEL[level];
  const requested = (await searchParams).tab as Tab;
  const tab: Tab = TABS.includes(requested) && !(requested === 'children' && !child) ? requested : 'overview';
  const t = await getTranslations('entity');
  const te = await getTranslations('entities');
  const tr = await getTranslations('report');
  const ta = await getTranslations('actionLog');
  const tf = await getTranslations('findings');
  const format = await getFormatter();
  const locale = pc.user.locale === 'en' ? 'en' : 'vi';
  const acc = info.account;
  const ranges = await currentRanges(acc.timezone);
  const money = (v: string | null, cur = acc.currency) =>
    v === null ? '—' : `${format.number(Number(v), { maximumFractionDigits: cur === 'VND' ? 0 : 2 })} ${cur}`;
  const nf = (v: number, o: Intl.NumberFormatOptions = {}) => format.number(v, o as never);
  const href = (tb: Tab) => `${entityHref(acc.id, level, metaId)}?tab=${tb}`;

  const crumbs = [
    <Link key="c" href="/clients" className="hover:text-fg">
      {t('crumbs.clients')}
    </Link>,
    ...(acc.clientId
      ? [
          <Link key="cl" href={`/clients/${acc.clientId}`} className="hover:text-fg">
            {acc.clientName}
          </Link>,
        ]
      : []),
    <Link key="a" href={`/accounts/${acc.id}`} className="hover:text-fg">
      {acc.name}
    </Link>,
    ...(info.campaign
      ? [
          <Link key="cp" href={entityHref(acc.id, 'campaign', info.campaign.metaId)} className="hover:text-fg">
            {info.campaign.name ?? info.campaign.metaId}
          </Link>,
        ]
      : []),
    ...(info.adset
      ? [
          <Link key="as" href={entityHref(acc.id, 'adset', info.adset.metaId)} className="hover:text-fg">
            {info.adset.name ?? info.adset.metaId}
          </Link>,
        ]
      : []),
    info.name ?? metaId,
  ];
  const active = (info.status ?? '').toUpperCase() === 'ACTIVE';

  return (
    <>
      <PageHeader
        breadcrumb={crumbs}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {info.name ?? metaId}
            <Badge tone="neutral">{te(`level.${level}`)}</Badge>
            <Badge tone={active ? 'success' : 'neutral'} data-testid="entity-status">
              {te.has(`status.${(info.status ?? '').toUpperCase()}`)
                ? te(`status.${(info.status ?? '').toUpperCase()}`)
                : (info.status ?? '—')}
            </Badge>
          </span>
        }
        actions={
          <a
            href={adsManagerLink(acc.metaAccountId, level, metaId)}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ kind: 'secondary', size: 'm' })}
          >
            {t('openAdsManager')}
          </a>
        }
      />
      {info.dailyBudget || info.learningStage ? (
        <p className="mb-3 text-small text-fg-secondary">
          {info.dailyBudget ? t('dailyBudget', { budget: money(info.dailyBudget) }) : null}
          {info.dailyBudget && info.learningStage ? ' · ' : null}
          {info.learningStage ? t('learning', { stage: info.learningStage }) : null}
        </p>
      ) : null}

      <TabBar className="mb-4">
        {TABS.filter((k) => k !== 'children' || child).map((k) => (
          <Link key={k} href={href(k)} role="tab" aria-selected={tab === k} className={tabItemClass(tab === k)}>
            {k === 'children' ? te(`levelPlural.${child}`) : t(`tabs.${k}`)}
          </Link>
        ))}
      </TabBar>

      {tab === 'overview' ? (
        <Overview />
      ) : tab === 'children' && child ? (
        <EntityGrid
          level={child}
          canAct={pc.flags.p2a_approve && !!acc.clientId && canApproveActions(pc.ctx.actor, acc.clientId)}
          rows={toGridRows(
            child,
            await childRows(pc.ctx, acc.id, level, metaId, ranges.cur),
            await childRows(pc.ctx, acc.id, level, metaId, ranges.prev),
            { [acc.id]: acc.currency },
          )}
        />
      ) : tab === 'findings' ? (
        <Findings />
      ) : (
        <History />
      )}
    </>
  );

  async function Overview() {
    const [cur, prev, daily, cpa, ageGender, placement, region] = await Promise.all([
      entityKpis(pc.ctx, acc.id, level, metaId, ranges.cur),
      entityKpis(pc.ctx, acc.id, level, metaId, ranges.prev),
      entityDaily(pc.ctx, acc.id, level, metaId, ranges.cur),
      entityCpaChange(pc.ctx, acc.id, level, metaId, ranges.cur, ranges.prev),
      entityBreakdown(pc.ctx, acc.id, level, metaId, ranges.cur, 'age_gender'),
      entityBreakdown(pc.ctx, acc.id, level, metaId, ranges.cur, 'placement'),
      entityBreakdown(pc.ctx, acc.id, level, metaId, ranges.cur, 'region'),
    ]);
    const groups = { age_gender: ageGender, placement, region };
    const anyBreakdown = Object.values(groups).some((g) => g.rows.length);
    return (
      <>
        <KpiRow cur={cur} prev={prev} currency={acc.currency} />
        {cpa ? (
          <CpaChangeBlock
            x={cpa}
            currency={acc.currency}
            t={(k, v) => tr(k as never, v as never)}
            money={money}
            nf={nf}
          />
        ) : null}
        <Card className="mt-4">
          <CardHeader title={t('trend')} />
          <div className="px-2 py-3">
            {Number(cur.spend) > 0 ? (
              <TrendChart
                spendLabel={`${te('cols.spend')} (${acc.currency})`}
                resultsLabel={te('cols.results')}
                data={daily.map((d) => ({ date: d.date, spend: Number(d.spend), results: d.results }))}
              />
            ) : (
              <EmptyState title={t('noData')} />
            )}
          </div>
        </Card>
        {anyBreakdown ? (
          <Card className="mt-4 px-4 py-3" data-testid="entity-audience">
            <h3 className="text-h3 font-semibold">{tr('sections.audience')}</h3>
            {level === 'ad' ? <p className="text-small text-fg-tertiary">{t('adsetScope')}</p> : null}
            <div className="mt-2 grid gap-4 md:grid-cols-3">
              {(['age_gender', 'placement', 'region'] as const).map((b) =>
                groups[b].rows.length ? (
                  <BreakdownList
                    key={b}
                    title={tr(`audience.${b}`)}
                    rows={groups[b].rows}
                    label={(k) => breakdownLabel(b, k, (key, v) => tr(key as never, v as never))}
                    money={(v) => money(v)}
                    nf={nf}
                    t={(k, v) => tr(k as never, v as never)}
                  />
                ) : null,
              )}
            </div>
          </Card>
        ) : null}
      </>
    );
  }

  async function Findings() {
    const rows = await entityFindings(pc.ctx, acc.id, level, metaId);
    if (!rows.length) {
      return (
        <Card>
          <EmptyState title={t('noFindings')} />
        </Card>
      );
    }
    return (
      <Card>
        <ul className="divide-y divide-line">
          {rows.map((f) => (
            <li key={f.id} className="px-4 py-3 text-body" data-testid="entity-finding">
              <Badge tone={f.severity === 'high' ? 'danger' : f.severity === 'medium' ? 'warning' : 'neutral'}>
                {tf(`severity.${f.severity}` as never)}
              </Badge>{' '}
              <span className="font-medium">{f.entityName ?? '—'}</span>
              <p className="mt-1 text-fg-secondary">{translateText(locale, f.explanation.why)}</p>
              <p className="text-small text-fg-tertiary">{translateText(locale, f.explanation.whatToDo)}</p>
            </li>
          ))}
        </ul>
      </Card>
    );
  }

  async function History() {
    const rows = await entityHistory(pc.ctx, acc.id, level, metaId);
    if (!rows.length) {
      return (
        <Card>
          <EmptyState title={t('noHistory')} description={t('noHistoryBody')} />
        </Card>
      );
    }
    return (
      <Card>
        <Table>
          <THead>
            <TR>
              <TH>{t('cols.at')}</TH>
              <TH>{t('cols.action')}</TH>
              <TH>{t('cols.change')}</TH>
              <TH>{t('cols.status')}</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((a) => (
              <TR key={a.id}>
                <TD muted>{format.dateTime(a.createdAt, { dateStyle: 'short', timeStyle: 'short' })}</TD>
                <TD>
                  <Link href={`/action-log/${a.id}`} className="text-link hover:underline">
                    {ta(`types.${a.actionType}` as never)}
                  </Link>
                  <span className="block text-small text-fg-tertiary">
                    {a.targetName ?? '—'}
                    {a.tier === 'auto' ? ` · ${t('auto')}` : ''}
                  </span>
                </TD>
                <TD className="num">
                  {describeChange({ ...a, currency: acc.currency }, format, { t: (k) => ta(k as never) })}
                </TD>
                <TD>{ta(`status.${a.status}` as never)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    );
  }
}
