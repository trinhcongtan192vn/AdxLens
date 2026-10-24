import { getTranslations } from 'next-intl/server';
import { getEnv } from '@adxlens/config/env';
import { getLlmKey, listApiKeys, LLM_MODELS } from '@adxlens/core/agent';
import { appBaseUrl, currentRequest } from '@/server/public-base';
import { getPageContext, requireFlag } from '@/server/page-context';
import { requirePermission } from '@/server/guards';
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
  const [keys, llm] = await Promise.all([listApiKeys(pc.ctx), getLlmKey(pc.ctx)]);
  const endpoint = `${appBaseUrl(await currentRequest())}/api/v1/mcp`;
  return (
    <>
      <LlmKeyCard
        models={LLM_MODELS}
        platform={Boolean(getEnv().ANTHROPIC_API_KEY)}
        current={
          llm
            ? {
                provider: llm.provider,
                model: llm.model,
                keyHint: llm.keyHint,
                lastUsedAt: llm.lastUsedAt?.toISOString() ?? null,
                lastError: llm.lastError,
              }
            : null
        }
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
