import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { schema, type Db } from '@adxlens/db';

const { oauthClients, oauthGrants } = schema;

/**
 * OAuth 2.1 cho connector MCP (ADR-0022 B): các bước xảy ra TRƯỚC khi biết workspace (đăng ký client, đổi mã lấy token,
 * tra token). TRUY VẤN XUYÊN WORKSPACE có chủ đích (CLAUDE.md quy tắc 1, chỉ được ở `core/ops`): token là bước xác thực,
 * tra theo hash duy nhất; mọi truy vấn sau đó chạy theo `workspace_id` của grant với quyền của người cấp.
 */

export const OAUTH_CODE_TTL_SECONDS = 600;
export const OAUTH_ACCESS_TTL_SECONDS = 3600;
export const OAUTH_REFRESH_TTL_SECONDS = 30 * 24 * 3600;
/** Số redirect_uri tối đa mỗi client. */
const MAX_REDIRECT_URIS = 10;

export const sha256Hex = (raw: string) => createHash('sha256').update(raw, 'utf8').digest('hex');
export const newOAuthToken = (prefix: 'adxc' | 'adxo' | 'adxr') => `${prefix}_${randomBytes(32).toString('base64url')}`;

/** https, hoặc http chỉ cho localhost / 127.0.0.1 (ứng dụng máy như Claude Code). Không fragment. */
export function validRedirectUri(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.hash || u.username || u.password) return false;
  if (u.protocol === 'https:') return true;
  return u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]');
}

export type OAuthError = { error: 'invalid_request' | 'invalid_client' | 'invalid_grant' | 'invalid_redirect_uri' };

/** Dynamic Client Registration (RFC 7591), chỉ client công khai. */
export async function registerOAuthClient(
  db: Db,
  input: { name: string; redirectUris: string[] },
): Promise<{ clientId: string; name: string; redirectUris: string[] } | OAuthError> {
  const name = input.name.trim().slice(0, 80) || 'MCP client';
  const uris = [...new Set(input.redirectUris)];
  if (!uris.length || uris.length > MAX_REDIRECT_URIS || !uris.every(validRedirectUri)) {
    return { error: 'invalid_redirect_uri' };
  }
  const clientId = `adxcl_${randomBytes(16).toString('base64url')}`;
  await db.insert(oauthClients).values({ id: clientId, name, redirectUris: uris });
  return { clientId, name, redirectUris: uris };
}

export async function getOAuthClient(
  db: Db,
  clientId: string,
): Promise<{ id: string; name: string; redirectUris: string[] } | null> {
  if (!/^adxcl_[\w-]{10,}$/.test(clientId)) return null;
  const [c] = await db
    .select({ id: oauthClients.id, name: oauthClients.name, redirectUris: oauthClients.redirectUris })
    .from(oauthClients)
    .where(eq(oauthClients.id, clientId));
  return c ?? null;
}

/** PKCE S256: base64url(sha256(verifier)) == challenge, so sánh thời gian hằng. */
export function pkceMatches(verifier: string, challenge: string): boolean {
  if (!/^[\w.~-]{43,128}$/.test(verifier)) return false;
  const a = Buffer.from(createHash('sha256').update(verifier, 'ascii').digest('base64url'));
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type OAuthTokens = {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  scope: string;
};

async function issue(db: Db, grantId: string, workspaceId: string, scopes: string[], now: Date): Promise<OAuthTokens> {
  const access = newOAuthToken('adxo');
  const refresh = newOAuthToken('adxr');
  await db
    .update(oauthGrants)
    .set({
      codeHash: null,
      codeExpiresAt: null,
      accessHash: sha256Hex(access),
      accessExpiresAt: new Date(now.getTime() + OAUTH_ACCESS_TTL_SECONDS * 1000),
      refreshHash: sha256Hex(refresh),
      refreshExpiresAt: new Date(now.getTime() + OAUTH_REFRESH_TTL_SECONDS * 1000),
    })
    .where(and(eq(oauthGrants.workspaceId, workspaceId), eq(oauthGrants.id, grantId)));
  return {
    access_token: access,
    token_type: 'Bearer',
    expires_in: OAUTH_ACCESS_TTL_SECONDS,
    refresh_token: refresh,
    scope: scopes.join(' '),
  };
}

/** grant_type=authorization_code: mã dùng một lần, đúng client + redirect_uri, PKCE khớp, chưa hết hạn. */
export async function exchangeOAuthCode(
  db: Db,
  input: { code: string; clientId: string; redirectUri: string; codeVerifier: string },
  now: Date = new Date(),
): Promise<OAuthTokens | OAuthError> {
  if (!input.code.startsWith('adxc_')) return { error: 'invalid_grant' };
  const [g] = await db
    .select()
    .from(oauthGrants)
    .where(
      and(
        eq(oauthGrants.codeHash, sha256Hex(input.code)),
        isNull(oauthGrants.revokedAt),
        gt(oauthGrants.codeExpiresAt, now),
      ),
    );
  if (!g || g.clientId !== input.clientId || g.redirectUri !== input.redirectUri) return { error: 'invalid_grant' };
  if (!pkceMatches(input.codeVerifier, g.codeChallenge)) return { error: 'invalid_grant' };
  return issue(db, g.id, g.workspaceId, g.scopes, now);
}

/** grant_type=refresh_token: xoay refresh token (token cũ hết dùng được). */
export async function refreshOAuthToken(
  db: Db,
  input: { refreshToken: string; clientId: string },
  now: Date = new Date(),
): Promise<OAuthTokens | OAuthError> {
  if (!input.refreshToken.startsWith('adxr_')) return { error: 'invalid_grant' };
  const [g] = await db
    .select()
    .from(oauthGrants)
    .where(
      and(
        eq(oauthGrants.refreshHash, sha256Hex(input.refreshToken)),
        isNull(oauthGrants.revokedAt),
        gt(oauthGrants.refreshExpiresAt, now),
      ),
    );
  if (!g || g.clientId !== input.clientId) return { error: 'invalid_grant' };
  return issue(db, g.id, g.workspaceId, g.scopes, now);
}

/** Access token của MCP → workspace + người cấp + phạm vi. Ghi lần dùng tối đa mỗi phút. */
export async function resolveOAuthToken(
  db: Db,
  raw: string,
  now: Date = new Date(),
): Promise<{ grantId: string; name: string; workspaceId: string; userId: string; scopes: string[] } | null> {
  if (!/^adxo_[\w-]{40,}$/.test(raw)) return null;
  const [g] = await db
    .select({
      id: oauthGrants.id,
      workspaceId: oauthGrants.workspaceId,
      userId: oauthGrants.userId,
      scopes: oauthGrants.scopes,
      lastUsedAt: oauthGrants.lastUsedAt,
      name: oauthClients.name,
    })
    .from(oauthGrants)
    .innerJoin(oauthClients, eq(oauthClients.id, oauthGrants.clientId))
    .where(
      and(
        eq(oauthGrants.accessHash, sha256Hex(raw)),
        isNull(oauthGrants.revokedAt),
        gt(oauthGrants.accessExpiresAt, now),
      ),
    );
  if (!g) return null;
  if (!g.lastUsedAt || now.getTime() - g.lastUsedAt.getTime() > 60_000) {
    await db
      .update(oauthGrants)
      .set({ lastUsedAt: now })
      .where(and(eq(oauthGrants.workspaceId, g.workspaceId), eq(oauthGrants.id, g.id)));
  }
  return { grantId: g.id, name: g.name, workspaceId: g.workspaceId, userId: g.userId, scopes: g.scopes };
}

/** Thu hồi theo token (RFC 7009): access hoặc refresh token → thu hồi cả grant. Token lạ vẫn trả ok (theo RFC). */
export async function revokeOAuthToken(db: Db, raw: string, now: Date = new Date()): Promise<void> {
  const h = sha256Hex(raw);
  const col = raw.startsWith('adxr_')
    ? oauthGrants.refreshHash
    : raw.startsWith('adxo_')
      ? oauthGrants.accessHash
      : null;
  if (!col) return;
  const [g] = await db
    .select({ id: oauthGrants.id, workspaceId: oauthGrants.workspaceId })
    .from(oauthGrants)
    .where(eq(col, h));
  if (!g) return;
  await db
    .update(oauthGrants)
    .set({ revokedAt: now, accessHash: null, refreshHash: null })
    .where(and(eq(oauthGrants.workspaceId, g.workspaceId), eq(oauthGrants.id, g.id)));
}
