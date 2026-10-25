import { getTranslations } from 'next-intl/server';
import { creativeLibrary } from '@adxlens/core/recommendation';
import { workspaceLlmProvider } from '@adxlens/core/agent';
import { listAssets } from '@adxlens/core/connections';
import { launcherSources } from '@adxlens/core/reporting';
import { canApproveActions, listClients } from '@adxlens/core/tenancy';
import { Banner, Card, EmptyState } from '@adxlens/ui';
import { WsHeader } from '@/components/workspace/ws-header';
import { getPageContext, requireFlag } from '@/server/page-context';
import { workspaceScope } from '@/server/workspace-scope';
import { CustomAudienceCard } from './custom-audience-card';
import { NewAdSetCard } from './new-adset-card';
import { NewCreativeCard } from './new-creative-card';
import { LauncherView } from './launcher-view';

export async function generateMetadata() {
  const t = await getTranslations('ws');
  return { title: t('nav.launcher') };
}

/**
 * Ad / Audience Launcher (Madgicx 3.4, ADR-0023): tạo quảng cáo từ creative tốt nhất vào nhóm QC có sẵn, tạo lookalike
 * từ custom audience. Mọi thao tác là hành động duyệt tay qua Execution Gateway. Cờ P2a kiểm ở server.
 */
export default async function LauncherPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string; creative?: string }>;
}) {
  const sp = await searchParams;
  const pc = await getPageContext();
  await requireFlag(pc, 'p2a_approve');
  const scope = await workspaceScope(pc);
  const t = await getTranslations('wsLauncher');
  const tw = await getTranslations('ws');
  // Mở từ Creative ("Mở trong Ad Launcher"): ưu tiên tài khoản trong link nếu người dùng được xem.
  const account = scope.accounts.find((a) => a.id === sp.account) ?? scope.selected ?? scope.accounts[0] ?? null;
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
  const [sources, creatives, clients, assets, llmProvider] = await Promise.all([
    launcherSources(pc.ctx, account.id),
    creativeLibrary(pc.ctx, account.id, scope.cur),
    listClients(pc.ctx),
    listAssets(pc.ctx),
    workspaceLlmProvider(pc.ctx),
  ]);
  // ADR-0026: nguồn custom audience — pixel của đúng tài khoản, Page / Instagram của workspace.
  const asset = (kind: 'pixel' | 'page' | 'instagram') =>
    assets
      .filter((a) => a.kind === kind && (kind !== 'pixel' || !a.parentId || a.parentId === account.metaAccountId))
      .map((a) => ({ metaId: a.metaId, name: a.name }));
  // Tem tên (Madgicx white label "asset name stamp"): tên mặc định bắt đầu bằng tên Client.
  const clientName = clients.find((c) => c.id === account.clientId)?.name ?? null;
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
      {!scope.selected && !sp.account ? (
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
        initialCreative={sp.creative ?? null}
        namePrefix={clientName}
      />
      <div className="mt-4">
        <NewCreativeCard
          adAccountId={account.id}
          canApprove={canApprove}
          pages={asset('page')}
          namePrefix={clientName}
          hasOpenAiKey={llmProvider === 'openai'}
        />
      </div>
      <div className="mt-4">
        <NewAdSetCard
          adAccountId={account.id}
          currency={account.currency}
          canApprove={canApprove}
          templates={sources.adsets}
          audiences={sources.audiences}
          namePrefix={clientName}
        />
      </div>
      <div className="mt-4">
        <CustomAudienceCard
          adAccountId={account.id}
          canApprove={canApprove}
          pixels={asset('pixel')}
          pages={asset('page')}
          instagram={asset('instagram')}
          namePrefix={clientName}
        />
      </div>
    </>
  );
}
