import { randomUUID } from 'node:crypto';
import {
  exchangeCode,
  exchangeLongLived,
  HttpMetaRead,
  MetaHttp,
  type MetaCallAudit,
  type MetaReadApi,
} from '@adxlens/meta-client';
import { MockMetaRead } from '@adxlens/meta-client/mock';

export type MetaConfig = {
  mock: boolean;
  apiVersion: string;
  appId?: string;
  appSecret?: string;
  onAudit?: (a: MetaCallAudit) => void | Promise<void>;
};

/** API đọc Meta theo môi trường: thật, hoặc mock khi META_MOCK=1 (chỉ local/test). */
export function metaReadApi(cfg: MetaConfig): MetaReadApi {
  if (cfg.mock) return new MockMetaRead();
  return new HttpMetaRead(new MetaHttp({ apiVersion: cfg.apiVersion, appSecret: cfg.appSecret, onAudit: cfg.onAudit }));
}

export type ExchangedToken = { token: string; expiresAt: Date | null };

/** Đổi code OAuth lấy token dài hạn (L3 6.1). Mock: trả token giả, không gọi mạng. */
export async function exchangeOAuthCode(
  cfg: MetaConfig,
  input: { code: string; redirectUri: string; scope?: 'read' | 'write' },
): Promise<ExchangedToken> {
  if (cfg.mock) {
    return {
      token: `mock-${input.scope === 'write' ? 'write' : 'read'}-${randomUUID()}`,
      expiresAt: new Date(Date.now() + 60 * 86_400_000),
    };
  }
  if (!cfg.appId || !cfg.appSecret) throw new Error('META_APP_ID/META_APP_SECRET chưa cấu hình');
  const http = new MetaHttp({ apiVersion: cfg.apiVersion, appSecret: cfg.appSecret, onAudit: cfg.onAudit });
  const short = await exchangeCode(http, {
    appId: cfg.appId,
    appSecret: cfg.appSecret,
    redirectUri: input.redirectUri,
    code: input.code,
  });
  const long = await exchangeLongLived(http, { appId: cfg.appId, appSecret: cfg.appSecret, token: short.access_token });
  return {
    token: long.access_token,
    expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : null,
  };
}
