import 'server-only';
import { getEnv } from '@adxlens/config/env';
import { httpPayos, type PayosApi } from '@adxlens/core/billing';
import { AppError } from '@adxlens/core/shared';

let override: PayosApi | null = null;
/** Test thay PayOS bằng bản giả. */
export function setPayosForTests(p: PayosApi | null): void {
  override = p;
}

/** PayOS sandbox/test (028). Chưa cấu hình khóa → 503. */
export function payos(): PayosApi {
  if (override) return override;
  const env = getEnv();
  if (!env.PAYOS_CLIENT_ID || !env.PAYOS_API_KEY || !env.PAYOS_CHECKSUM_KEY) {
    throw new AppError('SERVICE_UNAVAILABLE', 'Chưa cấu hình cổng thanh toán PayOS');
  }
  return httpPayos({ clientId: env.PAYOS_CLIENT_ID, apiKey: env.PAYOS_API_KEY, checksumKey: env.PAYOS_CHECKSUM_KEY });
}
