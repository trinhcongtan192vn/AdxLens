import { getTranslations } from 'next-intl/server';
import { adsManagerData, METRIC_KEYS } from '@adxlens/core/reporting';
import { canApproveActions } from '@adxlens/core/tenancy';
import { WsHeader } from '@/components/workspace/ws-header';
import { getPageContext } from '@/server/page-context';
import { workspaceScope } from '@/server/workspace-scope';
import { AdsManagerView } from './ads-manager-view';

export async function generateMetadata() {
  const t = await getTranslations('ws');
  return { title: t('nav.adsManager') };
}

/**
 * W7 — Ads Manager của Workspace. Bật / tắt chỉ hiện khi cờ `p2a_approve` bật và người dùng được duyệt hành động
 * (kiểm lại ở API + Execution Gateway).
 */
export default async function AdsManagerPage() {
  const pc = await getPageContext();
  const scope = await workspaceScope(pc);
  const tw = await getTranslations('ws');
  const t = await getTranslations('wsAm');
  const data = await adsManagerData(pc.ctx, scope.ids, scope.cur, scope.prev);
  const cur = new Map(scope.accounts.map((a) => [a.id, a.currency]));
  const clientOf = new Map(scope.accounts.map((a) => [a.id, a.clientId]));
  const canAct =
    pc.flags.p2a_approve &&
    scope.ids.every((id) => {
      const c = clientOf.get(id);
      return c ? canApproveActions(pc.ctx.actor, c) : pc.ctx.actor.role === 'owner';
    });
  return (
    <>
      <WsHeader
        title={tw('nav.adsManager')}
        subtitle={t('subtitle', { from: scope.cur.from, to: scope.cur.to })}
        accounts={scope.accounts}
        selectedId={scope.selected?.id ?? null}
        period={scope.period}
      />
      <AdsManagerView
        canAct={canAct}
        canAsk={pc.flags.p1_recommendations}
        currency={scope.currency}
        metricOptions={METRIC_KEYS}
        total={data.total}
        totalPrev={data.totalPrev}
        rows={data.rows.map((r) => ({ ...r, currency: cur.get(r.adAccountId) ?? scope.currency ?? 'VND' }))}
      />
    </>
  );
}
