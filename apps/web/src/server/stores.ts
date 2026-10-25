import 'server-only';
import { getEnv } from '@adxlens/config/env';
import { googleAnalyticsApi, shopeeApi, shopifyApi } from '@adxlens/core/stores';
import type { RequestLike } from '@/lib/public-url';
import { appBaseUrl } from './public-base';

/** ADR-0029: cấu hình Shopify; `enabled` = có app (hoặc STORE_MOCK ở local / test). */
export function shopifyConfig() {
  const env = getEnv();
  if (env.STORE_MOCK && (env.APP_ENV === 'production' || env.APP_ENV === 'staging')) {
    throw new Error('STORE_MOCK chỉ dùng ở local/test');
  }
  return {
    mock: env.STORE_MOCK,
    enabled: env.STORE_MOCK || Boolean(env.SHOPIFY_CLIENT_ID && env.SHOPIFY_CLIENT_SECRET),
    clientId: env.SHOPIFY_CLIENT_ID,
    clientSecret: env.SHOPIFY_CLIENT_SECRET,
    apiVersion: env.SHOPIFY_API_VERSION,
  };
}

export function shopify() {
  return shopifyApi(shopifyConfig());
}

/** redirect_uri của Shopify OAuth (khai báo trong app Partner, xem docs/runbooks/store-connectors.md). */
export function shopifyRedirectUri(req: RequestLike): string {
  return `${appBaseUrl(req)}/api/v1/stores/shopify/callback`;
}

/** ADR-0029: cấu hình Google OAuth (GA4); `enabled` = có client OAuth (hoặc STORE_MOCK ở local / test). */
export function ga4Config() {
  const env = getEnv();
  return {
    mock: env.STORE_MOCK,
    enabled: env.STORE_MOCK || Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
  };
}

export function ga4() {
  return googleAnalyticsApi(ga4Config());
}

/** redirect_uri của Google OAuth (khai báo trong Google Cloud, xem docs/runbooks/store-connectors.md). */
export function ga4RedirectUri(req: RequestLike): string {
  return `${appBaseUrl(req)}/api/v1/stores/ga4/callback`;
}

/** ADR-0029 (phụ lục Shopee): cấu hình Shopee Open Platform; `enabled` = có partner (hoặc STORE_MOCK). */
export function shopeeConfig() {
  const env = getEnv();
  return {
    mock: env.STORE_MOCK,
    enabled: env.STORE_MOCK || Boolean(env.SHOPEE_PARTNER_ID && env.SHOPEE_PARTNER_KEY),
    host: env.SHOPEE_HOST,
    partnerId: env.SHOPEE_PARTNER_ID,
    partnerKey: env.SHOPEE_PARTNER_KEY,
  };
}

export function shopee() {
  return shopeeApi(shopeeConfig());
}

/** Địa chỉ Shopee chuyển về (khai báo Redirect URL Domain trong app Shopee, xem runbook). */
export function shopeeRedirectUri(req: RequestLike): string {
  return `${appBaseUrl(req)}/api/v1/stores/shopee/callback`;
}
