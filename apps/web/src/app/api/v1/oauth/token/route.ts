import { exchangeOAuthCode, refreshOAuthToken } from '@adxlens/core/ops';
import { deps } from '@/server/deps';
import { clientIp, oauthError, readOAuthParams } from '@/server/oauth';
import { json, route } from '@/server/route';

/** Giới hạn lời gọi token mỗi IP / phút (chống dò mã). */
const TOKEN_LIMIT_PER_MINUTE = 60;

/**
 * Token endpoint (RFC 6749, OAuth 2.1, ADR-0022 B): `authorization_code` (PKCE S256 bắt buộc) và `refresh_token` (xoay).
 * Client công khai: `client_id` trong body, không secret.
 */
export const POST = route({
  auth: 'public',
  handler: async ({ req, db }) => {
    const rl = await deps().rateLimiter.hit(`oauth-token:${clientIp(req)}`, TOKEN_LIMIT_PER_MINUTE, 60);
    if (!rl.allowed) return oauthError('temporarily_unavailable', 429);
    const p = await readOAuthParams(req);
    const clientId = p.client_id ?? '';
    if (!clientId) return oauthError('invalid_client', 401);
    const r =
      p.grant_type === 'authorization_code'
        ? p.code && p.redirect_uri && p.code_verifier
          ? await exchangeOAuthCode(db, {
              code: p.code,
              clientId,
              redirectUri: p.redirect_uri,
              codeVerifier: p.code_verifier,
            })
          : ({ error: 'invalid_request' } as const)
        : p.grant_type === 'refresh_token'
          ? p.refresh_token
            ? await refreshOAuthToken(db, { refreshToken: p.refresh_token, clientId })
            : ({ error: 'invalid_request' } as const)
          : null;
    if (!r) return oauthError('unsupported_grant_type');
    if ('error' in r) return oauthError(r.error);
    return json(r, { headers: { 'cache-control': 'no-store', pragma: 'no-cache' } });
  },
});
