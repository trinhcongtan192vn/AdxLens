import { Building2 } from 'lucide-react';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { agencyOverview, clientGoalStatus } from '@adxlens/core/reporting';
import { Badge, Card, cn, Table, TBody, TD, TH, THead, TR } from '@adxlens/ui';
import { formatMetric, formatPct } from '@/lib/metric-format';
import { sortAgencyRows } from '@/lib/agency';
import { getPageContext } from '@/server/page-context';

/**
 * Tab "Agency" của trang chủ Workspace (Madgicx Home: Account / Agency): mỗi khách một dòng — chi tiêu 7 ngày so tuần
 * trước, sức khỏe thấp nhất, mục tiêu so với thực tế. Chỉ hiện ở phạm vi "Tất cả tài khoản". Số do code tính.
 */
export async function AgencyTable() {
  const pc = await getPageContext();
  const t = await getTranslations('wsHome.agency');
  const tm = await getTranslations('metrics');
  const tg = await getTranslations('goals');
  const locale = await getLocale();
  const [overview, goals] = await Promise.all([agencyOverview(pc.ctx), clientGoalStatus(pc.ctx)]);
  const rows = sortAgencyRows(
    overview.clients
      .filter((c) => c.accounts.length)
      .map((c) => {
        const g = goals.get(c.id) ?? null;
        return { c, g, name: c.name, health: c.health, vsTargetPct: g?.vsTargetPct ?? null };
      }),
  );
  if (rows.length < 2) return null;
  return (
    <Card className="mt-4 overflow-x-auto p-0" data-testid="ws-agency">
      <h2 className="flex items-center gap-2 px-4 pt-3 text-h4 font-semibold text-fg">
        <Building2 className="size-4 text-fg-tertiary" aria-hidden />
        {t('title')}
      </h2>
      <Table className="mt-2">
        <THead>
          <tr>
            <TH>{t('client')}</TH>
            <TH numeric>{t('spend7')}</TH>
            <TH numeric>{t('vsPrev')}</TH>
            <TH numeric>{t('health')}</TH>
            <TH>{t('goal')}</TH>
          </tr>
        </THead>
        <TBody>
          {rows.map(({ c, g }) => {
            const curs = Object.keys(c.spend7);
            const cur = curs[0] ?? null;
            const pct =
              cur && Number(c.spendPrev7[cur] ?? 0) > 0
                ? Math.round(((Number(c.spend7[cur]) - Number(c.spendPrev7[cur])) / Number(c.spendPrev7[cur])) * 1000) /
                  10
                : null;
            return (
              <TR key={c.id}>
                <TD>
                  <Link href={`/clients/${c.id}`} className="font-medium text-fg hover:text-brand">
                    {c.name}
                  </Link>
                  <span className="block text-caption text-fg-tertiary">{t('accounts', { n: c.accounts.length })}</span>
                </TD>
                <TD numeric>
                  {curs
                    .map((k) => formatMetric('spend', c.spend7[k] ?? null, k, locale, { compact: true }))
                    .join(' · ') || '—'}
                </TD>
                <TD numeric className="text-fg-secondary">
                  {formatPct(pct, locale)}
                </TD>
                <TD numeric>
                  {c.health == null ? (
                    '—'
                  ) : (
                    <Badge tone={c.health >= 80 ? 'success' : c.health >= 60 ? 'warning' : 'danger'}>{c.health}</Badge>
                  )}
                </TD>
                <TD>
                  {g ? (
                    <span className="text-small">
                      {tm(`${g.metric}.name`)}: {formatMetric(g.metric, g.actual, cur, locale)}{' '}
                      <span className="text-fg-tertiary">/ {formatMetric(g.metric, g.target, cur, locale)}</span>
                      {g.vsTargetPct != null ? (
                        <span className={cn('ml-1 font-medium', g.vsTargetPct >= 0 ? 'text-success' : 'text-danger')}>
                          {tg(g.vsTargetPct >= 0 ? 'tab.better' : 'tab.worse', { pct: `${Math.abs(g.vsTargetPct)}%` })}
                        </span>
                      ) : null}
                    </span>
                  ) : (
                    <Link href={`/clients/${c.id}/onboarding`} className="text-small text-link hover:underline">
                      {tg('bannerCta')}
                    </Link>
                  )}
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </Card>
  );
}
