import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Token khó đoán: 32 byte ngẫu nhiên, base64url (L3 mục 11). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/** So sánh hằng thời gian cho chuỗi bí mật. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
