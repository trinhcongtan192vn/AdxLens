import 'server-only';
import { getEnv } from '@adxlens/config/env';
import { keysFromEnv, metaReadApi, type MetaConfig } from '@adxlens/core/connections';
import type { RequestLike } from '@/lib/public-url';
import { appBaseUrl } from './public-base';

export function metaConfig(): MetaConfig {
  const env = getEnv();
  if (env.META_MOCK && (env.APP_ENV === 'production' || env.APP_ENV === 'staging')) {
    throw new Error('META_MOCK chỉ dùng ở local/test');
  }
  return {
    mock: env.META_MOCK,
    apiVersion: env.META_API_VERSION,
    appId: env.META_APP_ID,
    appSecret: env.META_APP_SECRET,
  };
}

export function metaRead() {
  return metaReadApi(metaConfig());
}

/** Khóa mã hóa token: web chỉ dùng để MÃ HÓA ở OAuth callback (L3 5.4), không giải mã. */
export function tokenKeys() {
  return keysFromEnv(getEnv());
}

/**
 * redirect_uri của Meta OAuth: theo origin công khai (APP_URL → header proxy → request), không theo `request.url` (sau
 * Cloudflare Tunnel là localhost). Bước bắt đầu và bước callback phải ra cùng một giá trị.
 */
export function oauthRedirectUri(req: RequestLike): string {
  return `${appBaseUrl(req)}/api/v1/connections/meta/callback`;
}
