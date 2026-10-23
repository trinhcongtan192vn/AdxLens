import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

function secret(): string {
  const s = process.env.INTERNAL_SIGNING_SECRET;
  if (!s || s.length < 32) throw new Error('INTERNAL_SIGNING_SECRET chưa cấu hình');
  return s;
}

/** Ký payload JSON (cookie state OAuth, URL in PDF nội bộ). Có hạn dùng. */
export function sign(payload: Record<string, unknown>, ttlSeconds: number): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString(
    'base64url',
  );
  const mac = createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function verify<T extends Record<string, unknown>>(token: string | undefined | null): T | null {
  if (!token) return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const expected = createHmac('sha256', secret()).update(body).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T & { exp: number };
    if (typeof data.exp !== 'number' || data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch {
    return null;
  }
}
