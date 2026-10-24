import type { MetaHttp } from './http';
import { tokenSchema, type MetaToken } from './types';

/** Quyền theo giai đoạn (L3 6.1): P0–P1 chỉ đọc; P2 thêm ads_management qua luồng nâng quyền riêng. */
export const READ_SCOPES = ['ads_read', 'business_management'] as const;
export const WRITE_SCOPES = [...READ_SCOPES, 'ads_management'] as const;

export function authorizeUrl(input: {
  apiVersion: string;
  appId: string;
  redirectUri: string;
  state: string;
  scopes: readonly string[];
  /** P2 nâng quyền: buộc Meta hỏi lại quyền đã từ chối. */
  rerequest?: boolean;
}): string {
  const u = new URL(`https://www.facebook.com/${input.apiVersion}/dialog/oauth`);
  u.searchParams.set('client_id', input.appId);
  u.searchParams.set('redirect_uri', input.redirectUri);
  u.searchParams.set('state', input.state);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', input.scopes.join(','));
  if (input.rerequest) u.searchParams.set('auth_type', 'rerequest');
  return u.toString();
}

/** Đổi code lấy token ngắn hạn. */
export function exchangeCode(
  http: MetaHttp,
  input: { appId: string; appSecret: string; redirectUri: string; code: string },
): Promise<MetaToken> {
  return http.get(
    'oauth/access_token',
    '',
    { client_id: input.appId, client_secret: input.appSecret, redirect_uri: input.redirectUri, code: input.code },
    tokenSchema,
  );
}

/** Đổi token ngắn hạn lấy token dài hạn (~60 ngày, L3 6.1). */
export function exchangeLongLived(
  http: MetaHttp,
  input: { appId: string; appSecret: string; token: string },
): Promise<MetaToken> {
  return http.get(
    'oauth/access_token',
    '',
    {
      grant_type: 'fb_exchange_token',
      client_id: input.appId,
      client_secret: input.appSecret,
      fb_exchange_token: input.token,
    },
    tokenSchema,
  );
}
