import { getTranslations } from 'next-intl/server';
import { getEnv } from '@adxlens/config/env';
import { hasWorkspaceLlmKey } from '@adxlens/core/agent';
import { entityNames } from '@adxlens/core/reporting';
import { canApproveActions } from '@adxlens/core/tenancy';
import { Banner } from '@adxlens/ui';
import { WsHeader } from '@/components/workspace/ws-header';
import { getPageContext, requireFlag } from '@/server/page-context';
import { workspaceScope } from '@/server/workspace-scope';
import { AgentChat, type ContextEntity } from './agent-chat';

export async function generateMetadata() {
  const t = await getTranslations('ws');
  return { title: t('nav.agents') };
}

/** AI Agents (ADR-0019) sau cờ `p1_recommendations`, kiểm ở server; đề xuất ghi theo cờ `p2a_approve`. */
const LEVELS = ['campaign', 'adset', 'ad'] as const;

export default async function AgentsPage({
  searchParams,
}: {
  searchParams: Promise<{ level?: string; ids?: string }>;
}) {
  const sp = await searchParams;
  const pc = await getPageContext();
  await requireFlag(pc, 'p1_recommendations');
  const scope = await workspaceScope(pc);
  const t = await getTranslations('wsAgents');
  // Ngữ cảnh từ bảng: ?level=adset&ids=1,2 — tên lấy từ DB theo quyền người xem (id lạ / không được xem thì bỏ).
  const level = LEVELS.find((l) => l === sp.level);
  const wanted = (sp.ids ?? '')
    .split(',')
    .filter((x) => /^\d{1,30}$/.test(x))
    .slice(0, 20);
  let initialContext: ContextEntity[] = [];
  if (level && wanted.length) {
    const names = await entityNames(
      pc.ctx,
      scope.accounts.map((a) => a.id),
      level,
    );
    initialContext = wanted
      .filter((id) => names.has(id))
      .map((id) => ({ level, metaId: id, name: names.get(id) ?? null }));
  }
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
        hideScope
      />
      {!getEnv().ANTHROPIC_API_KEY && !(await hasWorkspaceLlmKey(pc.ctx)) ? (
        <Banner tone="info" className="mb-3">
          {t('unconfiguredBanner')}
        </Banner>
      ) : null}
      <AgentChat
        accounts={scope.accounts.map((a) => ({ id: a.id, name: a.name }))}
        defaultAccountId={scope.selected?.id ?? null}
        canPropose={canPropose}
        initialContext={initialContext}
      />
    </>
  );
}
