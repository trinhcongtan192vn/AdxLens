import { z } from 'zod';
import { randomToken } from '@adxlens/core/shared';
import { authorizeUrl, READ_SCOPES, WRITE_SCOPES } from '@adxlens/meta-client';
import { metaConfig, oauthRedirectUri } from '@/server/meta';
import { route } from '@/server/route';
import { sign } from '@/server/signed';

const OAUTH_COOKIE = 'meta_oauth';

/**
 * Bắt đầu OAuth Meta (L3 10.2). `scope=read` cho P0–P1; `write` (P2) đi qua luồng nâng quyền riêng ở
 * feature 033 và kiểm cờ ở đó. State ký HMAC lưu cookie 10 phút, gắn workspace và user.
 */
export const GET = route({
  auth: 'workspace',
  permission: 'connections.manage',
  query: z.object({ scope: z.enum(['read']).default('read') }),
  handler: async (ctx, { query }) => {
    const cfg = metaConfig();
    const state = randomToken(16);
    const cookie = sign({ state, workspaceId: ctx.workspaceId, userId: ctx.user.id, scope: query.scope }, 600);
    const redirectUri = oauthRedirectUri();
    const target = cfg.mock
      ? `${redirectUri}?code=mock-code&state=${encodeURIComponent(state)}`
      : authorizeUrl({
          apiVersion: cfg.apiVersion,
          appId: cfg.appId ?? '',
          redirectUri,
          state,
          scopes: query.scope === 'read' ? READ_SCOPES : WRITE_SCOPES,
        });
    const res = new Response(null, { status: 302, headers: { location: target } });
    res.headers.append(
      'set-cookie',
      `${OAUTH_COOKIE}=${cookie}; Path=/api/v1/connections/meta; HttpOnly; SameSite=Lax; Max-Age=600`,
    );
    return res;
  },
});
