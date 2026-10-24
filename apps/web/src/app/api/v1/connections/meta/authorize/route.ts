import { z } from 'zod';
import { isEnabled } from '@adxlens/core/flags';
import { AppError, randomToken } from '@adxlens/core/shared';
import { can } from '@adxlens/core/tenancy';
import { getEnv } from '@adxlens/config/env';
import { authorizeUrl, connectScopes, WRITE_SCOPES } from '@adxlens/meta-client';
import { metaConfig, oauthRedirectUri } from '@/server/meta';
import { route } from '@/server/route';
import { sign } from '@/server/signed';

const OAUTH_COOKIE = 'meta_oauth';

/**
 * Bắt đầu OAuth Meta (L3 10.2). `scope=read` = kết nối với bộ quyền rộng ADR-0016 (ghi vẫn tắt tới khi Owner bật); `write` (P201, P2-01) chỉ khi cờ `p2a_approve` bật
 * và người dùng có quyền `write_scope.manage` (Owner). State ký HMAC lưu cookie 10 phút, gắn workspace và user.
 */
export const GET = route({
  auth: 'workspace',
  permission: 'connections.manage',
  query: z.object({ scope: z.enum(['read', 'write']).default('read') }),
  handler: async (ctx, { query }) => {
    if (query.scope === 'write') {
      if (!(await isEnabled(ctx, 'p2a_approve'))) throw new AppError('FEATURE_DISABLED', 'Không tìm thấy');
      if (!can(ctx.actor.role, 'write_scope.manage')) throw new AppError('FORBIDDEN', 'Không có quyền');
    }
    const cfg = metaConfig();
    const state = randomToken(16);
    const cookie = sign({ state, workspaceId: ctx.workspaceId, userId: ctx.user.id, scope: query.scope }, 600);
    const redirectUri = oauthRedirectUri(ctx.req);
    const target = cfg.mock
      ? `${redirectUri}?code=mock-code&state=${encodeURIComponent(state)}`
      : authorizeUrl({
          apiVersion: cfg.apiVersion,
          appId: cfg.appId ?? '',
          redirectUri,
          state,
          scopes: query.scope === 'read' ? connectScopes(getEnv().META_CONNECT_SCOPES) : WRITE_SCOPES,
          rerequest: query.scope === 'write',
        });
    const res = new Response(null, { status: 302, headers: { location: target } });
    res.headers.append(
      'set-cookie',
      `${OAUTH_COOKIE}=${cookie}; Path=/api/v1/connections/meta; HttpOnly; SameSite=Lax; Max-Age=600`,
    );
    return res;
  },
});
