import { getTranslations } from 'next-intl/server';
import { oauthScopes } from '@adxlens/core/agent';
import { getFlags } from '@adxlens/core/flags';
import { getOAuthClient } from '@adxlens/core/ops';
import { Banner } from '@adxlens/ui';
import { deps } from '@/server/deps';
import { mcpResourceUrl } from '@/server/oauth';
import { getPageContext } from '@/server/page-context';
import { currentRequest } from '@/server/public-base';
import { ConsentForm } from './consent-form';

export async function generateMetadata() {
  const t = await getTranslations('oauthConsent');
  return { title: t('pageTitle') };
}

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/**
 * Trang cấp quyền OAuth cho connector MCP (ADR-0022 B): Claude / ChatGPT mở trang này, người dùng đăng nhập AdxLens,
 * chọn workspace rồi Cho phép / Từ chối. Lỗi client / redirect_uri thì KHÔNG chuyển hướng (tránh open redirect).
 */
export default async function OAuthAuthorizePage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const t = await getTranslations('oauthConsent');
  const pc = await getPageContext();
  const { db } = deps();
  const clientId = one(sp.client_id);
  const redirectUri = one(sp.redirect_uri);
  const client = clientId ? await getOAuthClient(db, clientId) : null;
  if (!client || !client.redirectUris.includes(redirectUri)) {
    return <Banner tone="danger">{t('badClient')}</Banner>;
  }
  const resource = one(sp.resource);
  const badRequest =
    one(sp.response_type) !== 'code' ||
    one(sp.code_challenge_method) !== 'S256' ||
    !/^[\w-]{43}$/.test(one(sp.code_challenge)) ||
    (resource !== '' && resource.replace(/\/$/, '') !== mcpResourceUrl(await currentRequest()));
  if (badRequest) return <Banner tone="danger">{t('badRequest')}</Banner>;

  const workspaces = await Promise.all(
    pc.workspaces.map(async (w) => ({
      id: w.id,
      name: w.name,
      enabled: (await getFlags({ db, workspaceId: w.id })).p1_recommendations,
    })),
  );
  return (
    <ConsentForm
      clientName={client.name}
      email={pc.user.email}
      workspaces={workspaces}
      defaultWorkspaceId={pc.workspace.id}
      scopes={oauthScopes(one(sp.scope))}
      params={{
        client_id: client.id,
        redirect_uri: redirectUri,
        code_challenge: one(sp.code_challenge),
        code_challenge_method: 'S256',
        scope: one(sp.scope),
        state: one(sp.state),
      }}
    />
  );
}
