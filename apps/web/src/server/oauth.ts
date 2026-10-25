import 'server-only';
import type { RequestLike } from '@/lib/public-url';
import { appBaseUrl } from './public-base';

/** Phạm vi OAuth của connector MCP (ADR-0022 B) — cùng tên với phạm vi khóa API. */
export const OAUTH_SCOPES = ['read', 'propose'] as const;

export const mcpResourceUrl = (req: RequestLike) => `${appBaseUrl(req)}/api/v1/mcp`;
export const protectedResourceMetadataUrl = (req: RequestLike) =>
  `${appBaseUrl(req)}/.well-known/oauth-protected-resource`;

/** RFC 9728: tài nguyên được bảo vệ (MCP endpoint) và máy chủ cấp quyền của nó. */
export function protectedResourceMetadata(req: RequestLike) {
  return {
    resource: mcpResourceUrl(req),
    authorization_servers: [appBaseUrl(req)],
    scopes_supported: OAUTH_SCOPES,
    bearer_methods_supported: ['header'],
    resource_name: 'AdxLens',
  };
}

/** RFC 8414: máy chủ cấp quyền. Chỉ client công khai + PKCE S256. */
export function authorizationServerMetadata(req: RequestLike) {
  const base = appBaseUrl(req);
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/api/v1/oauth/token`,
    registration_endpoint: `${base}/api/v1/oauth/register`,
    revocation_endpoint: `${base}/api/v1/oauth/revoke`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    revocation_endpoint_auth_methods_supported: ['none'],
    scopes_supported: OAUTH_SCOPES,
  };
}

/** Body của endpoint OAuth: `application/x-www-form-urlencoded` (RFC 6749) hoặc JSON. */
export async function readOAuthParams(req: Request): Promise<Record<string, string>> {
  const type = req.headers.get('content-type') ?? '';
  const text = await req.text();
  if (type.includes('application/json')) {
    try {
      const v: unknown = JSON.parse(text || '{}');
      if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string'),
      );
    } catch {
      return {};
    }
  }
  return Object.fromEntries(new URLSearchParams(text));
}

/** IP người gọi cho giới hạn tần suất (sau Cloudflare / proxy). */
export function clientIp(req: Request): string {
  return (
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  );
}

/** Lỗi OAuth theo RFC 6749 mục 5.2 (không phải định dạng lỗi chung của API). */
export const oauthError = (error: string, status = 400, description?: string) =>
  Response.json(
    { error, ...(description ? { error_description: description } : {}) },
    { status, headers: { 'cache-control': 'no-store' } },
  );
