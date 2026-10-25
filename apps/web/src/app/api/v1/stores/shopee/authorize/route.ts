import { z } from 'zod';
import { AppError, randomToken } from '@adxlens/core/shared';
import { getClient } from '@adxlens/core/tenancy';
import { shopeeAuthorizeUrl } from '@adxlens/store-client';
import { route } from '@/server/route';
import { sign } from '@/server/signed';
import { shopeeConfig, shopeeRedirectUri } from '@/server/stores';

const COOKIE = 'shopee_oauth';

/**
 * ADR-0029 (Shopee): bắt đầu ủy quyền shop. Shopee không trả lại `state` → gắn `state` vào chính redirect URL, đối chiếu
 * với cookie ký 10 phút (cùng workspace, user, Client) ở callback.
 */
export const GET = route({
  auth: 'workspace',
  permission: 'connections.manage',
  query: z.object({ client_id: z.string().uuid().optional() }),
  handler: async (ctx, { query }) => {
    const cfg = shopeeConfig();
    if (!cfg.enabled) throw new AppError('FEATURE_DISABLED', 'Chưa cấu hình app Shopee');
    if (query.client_id) await getClient(ctx, query.client_id);
    const state = randomToken(16);
    const cookie = sign(
      { state, workspaceId: ctx.workspaceId, userId: ctx.user.id, clientId: query.client_id ?? null },
      600,
    );
    const redirect = `${shopeeRedirectUri(ctx.req)}?state=${encodeURIComponent(state)}`;
    const target = cfg.mock
      ? `${redirect}&code=mock&shop_id=123456`
      : shopeeAuthorizeUrl({
          host: cfg.host,
          partnerId: cfg.partnerId ?? '',
          partnerKey: cfg.partnerKey ?? '',
          redirect,
          timestamp: Math.floor(Date.now() / 1000),
        });
    const res = new Response(null, { status: 302, headers: { location: target } });
    res.headers.append(
      'set-cookie',
      `${COOKIE}=${cookie}; Path=/api/v1/stores/shopee; HttpOnly; SameSite=Lax; Max-Age=600`,
    );
    return res;
  },
});
