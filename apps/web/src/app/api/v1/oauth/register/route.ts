import { z } from 'zod';
import { registerOAuthClient } from '@adxlens/core/ops';
import { deps } from '@/server/deps';
import { clientIp, oauthError } from '@/server/oauth';
import { json, route } from '@/server/route';

/** Giới hạn đăng ký client mỗi IP / giờ. */
const REGISTER_LIMIT_PER_HOUR = 20;

const bodySchema = z.object({
  client_name: z.string().max(200).optional(),
  redirect_uris: z.array(z.string().max(2000)).min(1).max(10),
  token_endpoint_auth_method: z.string().optional(),
});

/**
 * Dynamic Client Registration (RFC 7591) cho Claude / ChatGPT… (ADR-0022 B). Chỉ client công khai: không cấp secret,
 * `token_endpoint_auth_method` luôn là `none`. Không cần đăng nhập (client đăng ký trước khi người dùng cấp quyền).
 */
export const POST = route({
  auth: 'public',
  handler: async ({ req, db }) => {
    const rl = await deps().rateLimiter.hit(`oauth-reg:${clientIp(req)}`, REGISTER_LIMIT_PER_HOUR, 3600);
    if (!rl.allowed) return oauthError('temporarily_unavailable', 429);
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return oauthError('invalid_client_metadata');
    }
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) return oauthError('invalid_client_metadata');
    const r = await registerOAuthClient(db, {
      name: parsed.data.client_name ?? 'MCP client',
      redirectUris: parsed.data.redirect_uris,
    });
    if ('error' in r) return oauthError(r.error);
    return json(
      {
        client_id: r.clientId,
        client_name: r.name,
        redirect_uris: r.redirectUris,
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        client_id_issued_at: Math.floor(Date.now() / 1000),
      },
      201,
    );
  },
});
