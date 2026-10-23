import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Ký/kiểm payload JSON có hạn (HMAC-SHA256). Dùng chung web và worker (URL in PDF nội bộ, cookie). Secret
 * truyền vào, không đọc env ở đây.
 */
export function signPayload(
  payload: Record<string, unknown>,
  ttlSeconds: number,
  secret: string,
  nowMs = Date.now(),
): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(nowMs / 1000) + ttlSeconds })).toString(
    'base64url',
  );
  const mac = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function verifyPayload<T extends Record<string, unknown>>(
  token: string | undefined | null,
  secret: string,
  nowMs = Date.now(),
): T | null {
  if (!token) return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const expected = createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T & { exp: number };
    if (typeof data.exp !== 'number' || data.exp < Math.floor(nowMs / 1000)) return null;
    return data;
  } catch {
    return null;
  }
}
