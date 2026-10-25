import { z } from 'zod';
import { AppError, randomToken } from '@adxlens/core/shared';
import { getClient } from '@adxlens/core/tenancy';
import { GA4_PROPERTY, googleAuthorizeUrl } from '@adxlens/store-client';
import { route } from '@/server/route';
import { sign } from '@/server/signed';
import { ga4Config, ga4RedirectUri } from '@/server/stores';

const COOKIE = 'ga4_oauth';

/**
 * ADR-0029: bắt đầu Google OAuth cho một GA4 property (nhập Property ID trước, gắn Client tùy chọn). State ký HMAC trong
 * cookie 10 phút, gắn workspace, user, property và Client.
 */
export const GET = route({
  auth: 'workspace',
  permission: 'connections.manage',
  query: z.object({ property_id: z.string().trim().max(20), client_id: z.string().uuid().optional() }),
  handler: async (ctx, { query }) => {
    const cfg = ga4Config();
    if (!cfg.enabled) throw new AppError('FEATURE_DISABLED', 'Chưa cấu hình Google OAuth');
    const property = query.property_id.replace(/^properties\//, '');
    if (!GA4_PROPERTY.test(property)) {
      throw new AppError('VALIDATION_FAILED', 'Property ID là dãy số', { field: 'property_id' });
    }
    if (query.client_id) await getClient(ctx, query.client_id);
    const state = randomToken(16);
    const cookie = sign(
      { state, workspaceId: ctx.workspaceId, userId: ctx.user.id, property, clientId: query.client_id ?? null },
      600,
    );
    const redirectUri = ga4RedirectUri(ctx.req);
    const target = cfg.mock
      ? `${redirectUri}?code=mock&state=${encodeURIComponent(state)}`
      : googleAuthorizeUrl({ clientId: cfg.clientId ?? '', redirectUri, state });
    const res = new Response(null, { status: 302, headers: { location: target } });
    res.headers.append(
      'set-cookie',
      `${COOKIE}=${cookie}; Path=/api/v1/stores/ga4; HttpOnly; SameSite=Lax; Max-Age=600`,
    );
    return res;
  },
});
