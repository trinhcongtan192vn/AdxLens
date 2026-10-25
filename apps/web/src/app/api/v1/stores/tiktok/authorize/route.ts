import { z } from 'zod';
import { AppError, randomToken } from '@adxlens/core/shared';
import { getClient } from '@adxlens/core/tenancy';
import { tiktokAuthorizeUrl } from '@adxlens/store-client';
import { route } from '@/server/route';
import { sign } from '@/server/signed';
import { tiktokConfig, tiktokRedirectUri } from '@/server/stores';

const COOKIE = 'tiktok_oauth';

/**
 * ADR-0029 (TikTok Shop): bắt đầu ủy quyền người bán. State ký HMAC trong cookie 10 phút (workspace, user, Client). Một
 * lần ủy quyền có thể gồm nhiều shop — mỗi shop thành một kết nối gắn cùng Client.
 */
export const GET = route({
  auth: 'workspace',
  permission: 'connections.manage',
  query: z.object({ client_id: z.string().uuid().optional() }),
  handler: async (ctx, { query }) => {
    const cfg = tiktokConfig();
    if (!cfg.enabled) throw new AppError('FEATURE_DISABLED', 'Chưa cấu hình app TikTok Shop');
    if (query.client_id) await getClient(ctx, query.client_id);
    const state = randomToken(16);
    const cookie = sign(
      { state, workspaceId: ctx.workspaceId, userId: ctx.user.id, clientId: query.client_id ?? null },
      600,
    );
    const target = cfg.mock
      ? `${tiktokRedirectUri(ctx.req)}?code=mock&state=${encodeURIComponent(state)}`
      : tiktokAuthorizeUrl({ serviceId: cfg.serviceId ?? '', state });
    const res = new Response(null, { status: 302, headers: { location: target } });
    res.headers.append(
      'set-cookie',
      `${COOKIE}=${cookie}; Path=/api/v1/stores/tiktok; HttpOnly; SameSite=Lax; Max-Age=600`,
    );
    return res;
  },
});
