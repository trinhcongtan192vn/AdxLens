import { getTranslations } from 'next-intl/server';
import { creativeLibrary } from '@adxlens/core/recommendation';
import { launcherSources } from '@adxlens/core/reporting';
import { canApproveActions } from '@adxlens/core/tenancy';
import { Banner, Card, EmptyState } from '@adxlens/ui';
import { WsHeader } from '@/components/workspace/ws-header';
import { getPageContext, requireFlag } from '@/server/page-context';
import { workspaceScope } from '@/server/workspace-scope';
import { LauncherView } from './launcher-view';

export async function generateMetadata() {
  const t = await getTranslations('ws');
  return { title: t('nav.launcher') };
}

/**
 * Ad / Audience Launcher (Madgicx 3.4, ADR-0023): tạo quảng cáo từ creative tốt nhất vào nhóm QC có sẵn, tạo lookalike
 * từ custom audience. Mọi thao tác là hành động duyệt tay qua Execution Gateway. Cờ P2a kiểm ở server.
 */
export default async function LauncherPage() {
  const pc = await getPageContext();
  await requireFlag(pc, 'p2a_approve');
  const scope = await workspaceScope(pc);
  const t = await getTranslations('wsLauncher');
  const tw = await getTranslations('ws');
  const account = scope.selected ?? scope.accounts[0] ?? null;
  const header = (
    <WsHeader
      title={tw('nav.launcher')}
      subtitle={t('subtitle')}
      accounts={scope.accounts}
      selectedId={scope.selected?.id ?? null}
      period={scope.period}
    />
  );
  if (!account) {
    return (
      <>
        {header}
        <Card>
          <EmptyState title={t('noAccount')} />
        </Card>
      </>
    );
  }
  const canApprove = account.clientId
    ? canApproveActions(pc.ctx.actor, account.clientId)
    : pc.ctx.actor.role === 'owner';
  const [sources, creatives] = await Promise.all([
    launcherSources(pc.ctx, account.id),
    creativeLibrary(pc.ctx, account.id, scope.cur),
  ]);
  const top = creatives
    .filter((c) => Number(c.metrics.spend) > 0)
    .sort(
      (a, b) =>
        Number(b.metrics.roas ?? -1) - Number(a.metrics.roas ?? -1) ||
        Number(b.metrics.spend) - Number(a.metrics.spend),
    )
    .slice(0, 30)
    .map((c) => ({
      creativeId: c.creativeId,
      name: c.name,
      thumbnailUrl: c.thumbnailUrl,
      format: c.format,
      spend: c.metrics.spend,
      roas: c.metrics.roas,
      ctr: c.metrics.ctr,
      results: c.metrics.results,
    }));
  return (
    <>
      {header}
      {!scope.selected ? (
        <Banner tone="info" className="mb-3">
          {t('pickAccount', { name: account.name })}
        </Banner>
      ) : null}
      {!canApprove ? (
        <Banner tone="warning" className="mb-3">
          {t('noPermission')}
        </Banner>
      ) : null}
      <LauncherView
        adAccountId={account.id}
        currency={account.currency}
        canApprove={canApprove}
        adsets={sources.adsets}
        audiences={sources.audiences}
        creatives={top}
      />
    </>
  );
}
