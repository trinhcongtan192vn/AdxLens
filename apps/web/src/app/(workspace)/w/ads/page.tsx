import { getTranslations } from 'next-intl/server';
import { adsGrid, METRIC_KEYS } from '@adxlens/core/reporting';
import { WsHeader } from '@/components/workspace/ws-header';
import { getPageContext } from '@/server/page-context';
import { workspaceScope } from '@/server/workspace-scope';
import { AdsView } from './ads-view';

export async function generateMetadata() {
  const t = await getTranslations('ws');
  return { title: t('nav.ads') };
}

/** W6 — Lưới quảng cáo (Madgicx Workspace "Ads"). Số do code tính; kỳ 7 / 14 / 30 ngày so kỳ trước. */
export default async function AdsPage() {
  const pc = await getPageContext();
  const scope = await workspaceScope(pc);
  const t = await getTranslations('wsAds');
  const tw = await getTranslations('ws');
  const byId = new Map(scope.accounts.map((a) => [a.id, a]));
  const cards = await adsGrid(pc.ctx, scope.ids, scope.cur, scope.prev);
  return (
    <>
      <WsHeader
        title={tw('nav.ads')}
        subtitle={t('subtitle', { from: scope.cur.from, to: scope.cur.to })}
        accounts={scope.accounts}
        selectedId={scope.selected?.id ?? null}
        period={scope.period}
      />
      <AdsView
        metricOptions={METRIC_KEYS}
        cards={cards.map((c) => ({
          adAccountId: c.adAccountId,
          accountName: byId.get(c.adAccountId)?.name ?? '',
          currency: byId.get(c.adAccountId)?.currency ?? scope.currency ?? 'VND',
          metaId: c.metaId,
          name: c.name,
          status: c.status,
          campaignName: c.campaignName,
          objective: c.objective,
          format: c.format,
          thumbnailUrl: c.thumbnailUrl,
          metrics: c.metrics,
          prev: c.prev,
        }))}
      />
    </>
  );
}
