import { eq } from 'drizzle-orm';
import type { Db } from '@adxlens/db';
import { schema } from '@adxlens/db';

/**
 * Tra link chia sẻ theo token cho trang công khai (R06). Truy vấn XUYÊN WORKSPACE có chủ đích (CLAUDE.md
 * quy tắc 1): người xem công khai không có workspace; token 32 byte ngẫu nhiên là khóa truy cập. Mọi xử
 * lý sau đó chạy trong workspace của link (`publicShareState`).
 */
export async function findShareByToken(db: Db, token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const [link] = await db.select().from(schema.shareLinks).where(eq(schema.shareLinks.token, token));
  return link ?? null;
}
