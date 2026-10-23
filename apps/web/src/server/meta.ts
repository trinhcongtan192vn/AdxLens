import 'server-only';
import { getEnv } from '@adxlens/config/env';
import { keysFromEnv, metaReadApi, type MetaConfig } from '@adxlens/core/connections';

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

export function oauthRedirectUri(): string {
  return `${getEnv().APP_URL}/api/v1/connections/meta/callback`;
}
