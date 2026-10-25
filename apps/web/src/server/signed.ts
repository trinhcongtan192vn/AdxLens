import 'server-only';
import { signPayload, verifyPayload } from '@adxlens/core/shared';

function secret(): string {
  const s = process.env.INTERNAL_SIGNING_SECRET;
  if (!s || s.length < 32) throw new Error('INTERNAL_SIGNING_SECRET chưa cấu hình');
  return s;
}

/** Ký payload JSON (cookie state OAuth, URL in PDF nội bộ). Có hạn dùng. */
export function sign(payload: Record<string, unknown>, ttlSeconds: number): string {
  return signPayload(payload, ttlSeconds, secret());
}

export function verify<T extends Record<string, unknown>>(token: string | undefined | null): T | null {
  return verifyPayload<T>(token, secret());
}
