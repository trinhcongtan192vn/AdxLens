import { z } from 'zod';
import { getClient } from '@adxlens/core/tenancy';
import { AppError, randomToken } from '@adxlens/core/shared';
import { normalizeShop, shopifyAuthorizeUrl } from '@adxlens/store-client';
import { route } from '@/server/route';
import { sign } from '@/server/signed';
import { shopifyConfig, shopifyRedirectUri } from '@/server/stores';

const SHOPIFY_COOKIE = 'shopify_oauth';

/**
 * ADR-0029: bắt đầu OAuth Shopify cho một shop (gắn Client tùy chọn). State ký HMAC trong cookie 10 phút, gắn workspace,
 * user, shop và Client.
 */
export const GET = route({
  auth: 'workspace',
  permission: 'connections.manage',
  query: z.object({ shop: z.string().min(1).max(120), client_id: z.string().uuid().optional() }),
  handler: async (ctx, { query }) => {
    const cfg = shopifyConfig();
    if (!cfg.enabled) throw new AppError('FEATURE_DISABLED', 'Chưa cấu hình app Shopify');
    const shop = normalizeShop(query.shop);
    if (!shop) throw new AppError('VALIDATION_FAILED', 'Tên shop không hợp lệ', { field: 'shop' });
    if (query.client_id) await getClient(ctx, query.client_id);
    const state = randomToken(16);
    const cookie = sign(
      { state, workspaceId: ctx.workspaceId, userId: ctx.user.id, shop, clientId: query.client_id ?? null },
      600,
    );
    const redirectUri = shopifyRedirectUri(ctx.req);
    const target = cfg.mock
      ? `${redirectUri}?code=mock&shop=${shop}&state=${encodeURIComponent(state)}`
      : shopifyAuthorizeUrl({ shop, clientId: cfg.clientId ?? '', redirectUri, state });
    const res = new Response(null, { status: 302, headers: { location: target } });
    res.headers.append(
      'set-cookie',
      `${SHOPIFY_COOKIE}=${cookie}; Path=/api/v1/stores/shopify; HttpOnly; SameSite=Lax; Max-Age=600`,
    );
    return res;
  },
});
