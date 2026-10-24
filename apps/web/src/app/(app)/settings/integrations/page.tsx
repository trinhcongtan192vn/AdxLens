import { getTranslations } from 'next-intl/server';
import { listApiKeys } from '@adxlens/core/agent';
import { appBaseUrl, currentRequest } from '@/server/public-base';
import { getPageContext, requireFlag } from '@/server/page-context';
import { requirePermission } from '@/server/guards';
import { IntegrationsView } from './integrations-view';

export async function generateMetadata() {
  const t = await getTranslations('settings');
  return { title: t('integrations') };
}

/** Cài đặt → Tích hợp (ADR-0020): khóa API cho MCP server, sau cờ P1; owner / manager. */
export default async function IntegrationsPage() {
  const pc = await getPageContext();
  await requireFlag(pc, 'p1_recommendations');
  requirePermission(pc, 'clients.manage');
  const keys = await listApiKeys(pc.ctx);
  const endpoint = `${appBaseUrl(await currentRequest())}/api/v1/mcp`;
  return (
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
  );
}
