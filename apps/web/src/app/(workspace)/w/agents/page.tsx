import { getTranslations } from 'next-intl/server';
import { getEnv } from '@adxlens/config/env';
import { canApproveActions } from '@adxlens/core/tenancy';
import { Banner } from '@adxlens/ui';
import { WsHeader } from '@/components/workspace/ws-header';
import { getPageContext, requireFlag } from '@/server/page-context';
import { workspaceScope } from '@/server/workspace-scope';
import { AgentChat } from './agent-chat';

export async function generateMetadata() {
  const t = await getTranslations('ws');
  return { title: t('nav.agents') };
}

/** AI Agents (ADR-0019) sau cờ `p1_recommendations`, kiểm ở server; đề xuất ghi theo cờ `p2a_approve`. */
export default async function AgentsPage() {
  const pc = await getPageContext();
  await requireFlag(pc, 'p1_recommendations');
  const scope = await workspaceScope(pc);
  const t = await getTranslations('wsAgents');
  const tw = await getTranslations('ws');
  const canPropose =
    pc.flags.p2a_approve &&
    scope.accounts.some((a) =>
      a.clientId ? canApproveActions(pc.ctx.actor, a.clientId) : pc.ctx.actor.role === 'owner',
    );
  return (
    <>
      <WsHeader
        title={tw('nav.agents')}
        subtitle={t('subtitle')}
        accounts={scope.accounts}
        selectedId={scope.selected?.id ?? null}
        period={scope.period}
        hideScope
      />
      {!getEnv().ANTHROPIC_API_KEY ? (
        <Banner tone="info" className="mb-3">
          {t('unconfiguredBanner')}
        </Banner>
      ) : null}
      <AgentChat
        accounts={scope.accounts.map((a) => ({ id: a.id, name: a.name }))}
        defaultAccountId={scope.selected?.id ?? null}
        canPropose={canPropose}
      />
    </>
  );
}
