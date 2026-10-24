import { Activity, AlertTriangle, Bot, ChartLine, FileText, Radar, Sparkles, Zap } from 'lucide-react';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { topFindings } from '@adxlens/core/insight';
import {
  changeIsGood,
  defaultHomeMetrics,
  healthLabel,
  listClientGoals,
  METRIC_KEYS,
  workspaceHome,
  type MetricKey,
} from '@adxlens/core/reporting';
import { Badge, buttonVariants, Card, cn, EmptyState } from '@adxlens/ui';
import { KpiCustomize } from '@/components/workspace/kpi-customize';
import { Sparkline } from '@/components/workspace/sparkline';
import { WsHeader } from '@/components/workspace/ws-header';
import { formatMetric, formatPct } from '@/lib/metric-format';
import { W_KPIS_COOKIE } from '@/lib/workspace-nav';
import { translateText } from '@/server/translate';
import { getPageContext } from '@/server/page-context';
import { workspaceScope } from '@/server/workspace-scope';
import { AgencyTable } from './agency-table';
import { AlertSuggestions } from './alert-suggestions';

export async function generateMetadata() {
  const t = await getTranslations('ws');
  return { title: t('nav.home') };
}

/**
 * Trang chủ Workspace (W4, bố cục theo Madgicx Home): sức khỏe tài khoản, tracking (Pixel), 4 KPI tùy chỉnh có
 * sparkline + so kỳ trước + độ phủ dữ liệu, hỏi AI + thao tác nhanh, Cần chú ý, gợi ý cảnh báo từ dữ liệu.
 */
export default async function WorkspaceHome() {
  const pc = await getPageContext();
  const scope = await workspaceScope(pc);
  const t = await getTranslations('wsHome');
  const tw = await getTranslations('ws');
  const tm = await getTranslations('metrics');
  const locale = (await getLocale()) as 'vi' | 'en';
  const header = (
    <WsHeader
      title={t('greeting', { name: pc.user.fullName?.split(' ').pop() ?? '' })}
      subtitle={scope.selected ? scope.selected.name : tw('scope.agency', { n: scope.accounts.length })}
      accounts={scope.accounts}
      selectedId={scope.selected?.id ?? null}
      period={scope.period}
    />
  );
  if (!scope.accounts.length) {
    return (
      <>
        {header}
        <Card>
          <EmptyState
            title={t('emptyTitle')}
            description={t('emptyBody')}
            action={
              <a href="/connections/new" className={buttonVariants({ kind: 'primary', size: 'm' })}>
                {t('connect')}
              </a>
            }
          />
        </Card>
      </>
    );
  }

  // KPI: lựa chọn của người xem (cookie) → mục tiêu Client của tài khoản đang chọn → bộ mặc định kiểu Madgicx.
  const saved = ((await cookies()).get(W_KPIS_COOKIE)?.value ?? '')
    .split('.')
    .filter((k): k is MetricKey => (METRIC_KEYS as readonly string[]).includes(k));
  const goals = await listClientGoals(pc.ctx);
  const goal = scope.selected?.clientId ? (goals.get(scope.selected.clientId) ?? null) : null;
  const metrics = saved.length === 4 ? saved : defaultHomeMetrics(goal);
  const accById = new Map(scope.accounts.map((a) => [a.id, a]));
  const metaIds = scope.accounts.filter((a) => scope.ids.includes(a.id)).map((a) => a.metaAccountId);
  const [home, findings] = await Promise.all([
    workspaceHome(pc.ctx, { ids: scope.ids, metaAccountIds: metaIds, cur: scope.cur, prev: scope.prev }, metrics),
    topFindings(pc.ctx, scope.ids, 6),
  ]);
  const fmt = (k: string, v: string | null) => formatMetric(k, v, scope.currency, locale);
  const health = home.health.score;
  const hl = health == null ? null : healthLabel(health);
  const p1 = pc.flags.p1_recommendations;

  return (
    <>
      {header}
      {scope.excludedOtherCurrency ? (
        <p className="-mt-2 mb-3 text-caption text-fg-tertiary">
          {t('otherCurrency', { n: scope.excludedOtherCurrency, currency: scope.currency ?? '' })}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Sức khỏe tài khoản (Madgicx "Meta account health"). */}
        <Card data-testid="ws-health">
          <div className="flex items-center gap-2 text-small text-fg-tertiary">
            <Activity className="size-4" aria-hidden />
            {t('health.title')}
          </div>
          {health == null ? (
            <p className="mt-3 text-body text-fg-secondary">{t('health.none')}</p>
          ) : (
            <>
              <p className="mt-2 flex items-baseline gap-2">
                <span
                  className={cn(
                    'num text-[40px] font-semibold leading-none',
                    health >= 80
                      ? 'text-success'
                      : health >= 60
                        ? 'text-fg'
                        : health >= 40
                          ? 'text-warning'
                          : 'text-danger',
                  )}
                >
                  {health}
                </span>
                <span className="text-body font-medium text-fg-secondary">· {t(`health.${hl}`)}</span>
              </p>
              <p className="mt-1 text-caption text-fg-tertiary">
                {scope.selected ? t('health.single') : t('health.agency', { avg: home.health.average ?? 0 })}
              </p>
              {scope.selected ? (
                <Link
                  href={`/accounts/${scope.selected.id}`}
                  className="mt-3 inline-block text-small text-link hover:underline"
                >
                  {t('health.details')}
                </Link>
              ) : (
                <ul className="mt-3 space-y-1">
                  {home.health.perAccount
                    .sort((a, b) => a.score - b.score)
                    .slice(0, 3)
                    .map((a) => (
                      <li key={a.id} className="flex justify-between text-small">
                        <Link href={`/accounts/${a.id}`} className="truncate text-fg-secondary hover:text-fg">
                          {accById.get(a.id)?.name}
                        </Link>
                        <span className="num font-medium text-fg">{a.score}</span>
                      </li>
                    ))}
                </ul>
              )}
            </>
          )}
        </Card>

        {/* Tracking: Pixel từ tài sản Meta (Madgicx để "Coming soon"). */}
        <Card data-testid="ws-tracking">
          <div className="flex items-center gap-2 text-small text-fg-tertiary">
            <Radar className="size-4" aria-hidden />
            {t('tracking.title')}
          </div>
          {home.pixels.length ? (
            <ul className="mt-3 space-y-2">
              {home.pixels.slice(0, 4).map((p) => {
                const fired = p.lastFiredTime ? new Date(p.lastFiredTime) : null;
                const hours = fired ? (Date.now() - fired.getTime()) / 3_600_000 : null;
                return (
                  <li key={p.id} className="flex items-center justify-between gap-2 text-small">
                    <span className="truncate text-fg">{p.name}</span>
                    <Badge
                      tone={
                        hours != null && hours < 24 ? 'success' : hours != null && hours < 72 ? 'warning' : 'danger'
                      }
                    >
                      {hours == null
                        ? t('tracking.never')
                        : hours < 24
                          ? t('tracking.active')
                          : t('tracking.stale', { days: Math.floor(hours / 24) })}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-3 text-body text-fg-secondary">{t('tracking.none')}</p>
          )}
        </Card>

        {/* Hỏi AI + thao tác nhanh (Madgicx Agents + Quick actions). */}
        <Card data-testid="ws-ask">
          <div className="flex items-center gap-2 text-small text-fg-tertiary">
            <Bot className="size-4" aria-hidden />
            {t('ask.title')}
          </div>
          {p1 ? (
            <form action="/w/agents" className="mt-3">
              <input
                name="q"
                placeholder={t('ask.placeholder')}
                aria-label={t('ask.title')}
                className="h-9 w-full rounded-lg border border-line-control bg-surface px-3 text-body text-fg placeholder:text-fg-tertiary focus:border-line-focus focus:outline-none"
              />
            </form>
          ) : (
            <p className="mt-3 text-small text-fg-secondary">{t('ask.locked')}</p>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            {[
              {
                k: 'whyCpa',
                href: p1 ? `/w/agents?q=${encodeURIComponent(t('ask.whyCpaQ'))}` : '/w/ads-manager',
                icon: Sparkles,
              },
              {
                k: 'report',
                href: '/reports/new',
                icon: FileText,
                hide: !pc.flags.p0_reports || pc.actor.role === 'buyer',
              },
              { k: 'alert', href: '/w/alerts?new=1', icon: AlertTriangle },
              { k: 'rule', href: '/automation/new', icon: Zap, hide: !pc.flags.p2b_auto || pc.actor.role === 'buyer' },
            ]
              .filter((q) => !q.hide)
              .map((q) => (
                <Link
                  key={q.k}
                  href={q.href}
                  className="flex items-center gap-2 rounded-lg border border-line px-2 py-2 text-small text-fg hover:bg-hover"
                >
                  <q.icon className="size-4 text-brand" aria-hidden />
                  {t(`quick.${q.k}`)}
                </Link>
              ))}
          </div>
        </Card>
      </div>

      {/* Performance overview: 4 KPI tùy chỉnh. */}
      <section className="mt-4" aria-labelledby="perf">
        <div className="mb-2 flex items-center gap-2">
          <ChartLine className="size-4 text-fg-tertiary" aria-hidden />
          <h2 id="perf" className="text-h4 font-semibold text-fg">
            {t('perf.title')}
          </h2>
          <span className="text-caption text-fg-tertiary" data-testid="ws-coverage">
            {t('perf.coverage', { days: home.coverage.days, total: home.coverage.total })}
          </span>
          <div className="flex-1" />
          <KpiCustomize current={metrics} options={METRIC_KEYS} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {home.kpis.map((k) => {
            const good = changeIsGood(k.key, k.changePct);
            return (
              <Card key={k.key} data-testid={`ws-kpi-${k.key}`}>
                <p className="text-small text-fg-tertiary">{tm(`${k.key}.name`)}</p>
                <p className="num mt-1 text-h2 font-semibold text-fg">{fmt(k.key, k.cur)}</p>
                <p className="mt-0.5 text-caption">
                  <span
                    className={cn(
                      'num font-medium',
                      good === true ? 'text-success' : good === false ? 'text-danger' : 'text-fg-secondary',
                    )}
                  >
                    {formatPct(k.changePct, locale)}
                  </span>{' '}
                  <span className="text-fg-tertiary">{t('perf.vsPrev', { value: fmt(k.key, k.prev) })}</span>
                </p>
                <div className="mt-2">
                  <Sparkline
                    values={k.series}
                    prev={k.prevSeries}
                    tone={good === true ? 'good' : good === false ? 'bad' : 'neutral'}
                    width={220}
                    label={tm(`${k.key}.name`)}
                  />
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      {scope.selected ? null : <AgencyTable />}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Cần chú ý: phát hiện đang mở (số do rule tính, không LLM). */}
        <Card data-testid="ws-attention">
          <h2 className="mb-2 flex items-center gap-2 text-h4 font-semibold text-fg">
            <AlertTriangle className="size-4 text-warning" aria-hidden />
            {t('attention.title')}
          </h2>
          {findings.length ? (
            <ul className="divide-y divide-line">
              {findings.map((f) => (
                <li key={f.id} className="flex items-start gap-3 py-2">
                  <Badge tone={f.severity === 'high' ? 'danger' : f.severity === 'medium' ? 'warning' : 'neutral'}>
                    {t(`attention.sev.${f.severity}`)}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/accounts/${f.adAccountId}/findings?finding=${f.id}`}
                      className="line-clamp-2 text-small text-fg hover:text-brand"
                    >
                      {translateText(locale, f.explanation.why)}
                    </Link>
                    <p className="truncate text-caption text-fg-tertiary">
                      {accById.get(f.adAccountId)?.name}
                      {f.entityName ? ` · ${f.entityName}` : ''}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body text-fg-secondary">{t('attention.none')}</p>
          )}
        </Card>
        <AlertSuggestions
          scopeIds={scope.ids}
          currency={scope.currency}
          timezone={scope.timezone}
          selectedId={scope.selected?.id ?? null}
        />
      </div>
    </>
  );
}
