import type { MetaHttp } from './http';
import { tokenSchema, type MetaToken } from './types';

/** Quyền đọc tối thiểu (L3 6.1). Chỉ `ads_read` là bắt buộc khi kết nối. */
export const READ_SCOPES = ['ads_read', 'business_management'] as const;
/** Luồng nâng quyền ghi P201 cho kết nối cũ chưa có `ads_management`. */
export const WRITE_SCOPES = [...READ_SCOPES, 'ads_management'] as const;

/**
 * ADR-0016: bộ quyền xin một lần khi kết nối (như Madgicx). Có `ads_management` trong scope CHƯA cho ghi: ghi vẫn cần
 * Owner bật quyền ghi + cờ P2 + Execution Gateway (ADR-0008). Không xin `email` (Login for Business từ chối).
 */
export const CONNECT_SCOPES = [
  ...WRITE_SCOPES,
  'catalog_management',
  'pages_show_list',
  'pages_read_engagement',
  'pages_read_user_content',
  'pages_manage_ads',
  'pages_manage_posts',
  'pages_manage_engagement',
  'leads_retrieval',
  'instagram_basic',
] as const;

/**
 * Bộ quyền dùng khi kết nối: `override` (env `META_CONNECT_SCOPES`, danh sách cách nhau dấu phẩy) để bỏ quyền mà app
 * Meta chưa có use case (Meta báo "Invalid Scopes" cho cả hộp thoại). Luôn giữ `ads_read`.
 */
export function connectScopes(override?: string): string[] {
  const list = override
    ? override
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [...CONNECT_SCOPES];
  return list.includes('ads_read') ? [...new Set(list)] : ['ads_read', ...new Set(list)];
}

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
