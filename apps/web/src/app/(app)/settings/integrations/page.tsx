import { getTranslations } from 'next-intl/server';
import { getEnv } from '@adxlens/config/env';
import {
  IMAGE_MODELS,
  listApiKeys,
  listLlmKeys,
  listLlmRoutes,
  listOAuthGrants,
  LLM_MODELS,
  TASK_PROVIDERS,
} from '@adxlens/core/agent';
import { appBaseUrl, currentRequest } from '@/server/public-base';
import { getPageContext, requireFlag } from '@/server/page-context';
import { requirePermission } from '@/server/guards';
import { ConnectorCard } from './connector-card';
import { IntegrationsView } from './integrations-view';
import { LlmKeyCard } from './llm-key-card';

export async function generateMetadata() {
  const t = await getTranslations('settings');
  return { title: t('integrations') };
}

/** Cài đặt → Tích hợp (ADR-0020, 0022): khóa AI tự mang + khóa API cho MCP server, sau cờ P1; owner / manager. */
export default async function IntegrationsPage() {
  const pc = await getPageContext();
  await requireFlag(pc, 'p1_recommendations');
  requirePermission(pc, 'clients.manage');
  const [keys, llmKeys, routes, grants] = await Promise.all([
    listApiKeys(pc.ctx),
    listLlmKeys(pc.ctx),
    listLlmRoutes(pc.ctx),
    listOAuthGrants(pc.ctx),
  ]);
  const endpoint = `${appBaseUrl(await currentRequest())}/api/v1/mcp`;
  return (
    <>
      <LlmKeyCard
        models={LLM_MODELS}
        imageModels={IMAGE_MODELS}
        taskProviders={TASK_PROVIDERS}
        platform={Boolean(getEnv().ANTHROPIC_API_KEY)}
        keys={llmKeys.map((k) => ({
          provider: k.provider,
          model: k.model,
          keyHint: k.keyHint,
          lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
          lastError: k.lastError,
        }))}
        routes={Object.values(routes).map((r) => ({
          task: r!.task,
          provider: r!.provider,
          model: r!.model,
          source: r!.source,
        }))}
      />
      <div className="mt-4" />
      <ConnectorCard
        endpoint={endpoint}
        grants={grants.map((g) => ({
          id: g.id,
          clientName: g.clientName,
          scopes: g.scopes,
          mine: g.mine,
          lastUsedAt: g.lastUsedAt?.toISOString() ?? null,
          createdAt: g.createdAt.toISOString(),
        }))}
      />
      <div className="mt-4" />
      <IntegrationsView
        endpoint={endpoint}
        canPropose={pc.flags.p2a_approve}
        keys={keys.map((k) => ({
          id: k.id,
          name: k.name,
          prefix: k.prefix,
          scopes: k.scopes,
          lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
          revokedAt: k.revokedAt?.toISOString() ?? null,
          createdAt: k.createdAt.toISOString(),
        }))}
      />
    </>
  );
}
