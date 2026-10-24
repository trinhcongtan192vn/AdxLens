import { eq } from 'drizzle-orm';
import type { DbOrTx } from '@adxlens/db';
import { schema } from '@adxlens/db';
import { sha256, systemClock, type Clock } from '@adxlens/core/shared';

const { authThrottle } = schema;

export const MAX_LOGIN_FAILURES = 5;
export const LOCK_MINUTES = 15;

const keyOf = (email: string) => sha256(`login:${email.trim().toLowerCase()}`);

export type ThrottleState = { locked: false; remaining: number } | { locked: true; minutesLeft: number };

/** Trạng thái trước khi đăng nhập. Áp dụng như nhau cho email có hay không có tài khoản. */
export async function loginThrottleState(
  db: DbOrTx,
  email: string,
  clock: Clock = systemClock,
): Promise<ThrottleState> {
  const [row] = await db
    .select()
    .from(authThrottle)
    .where(eq(authThrottle.keyHash, keyOf(email)));
  const now = clock.now();
  if (row?.lockedUntil && row.lockedUntil > now) {
    return {
      locked: true,
      minutesLeft: Math.ceil((row.lockedUntil.getTime() - now.getTime()) / 60_000),
    };
  }
  return {
    locked: false,
    remaining: MAX_LOGIN_FAILURES - (row?.lockedUntil ? 0 : (row?.failures ?? 0)),
  };
}

/** Ghi một lần sai; đủ 5 lần thì khóa 15 phút. Trả trạng thái sau khi ghi. */
export async function recordLoginFailure(
  db: DbOrTx,
  email: string,
  clock: Clock = systemClock,
): Promise<ThrottleState> {
  const key = keyOf(email);
  const now = clock.now();
  const [row] = await db.select().from(authThrottle).where(eq(authThrottle.keyHash, key));
  const expiredLock = row?.lockedUntil && row.lockedUntil <= now;
  const failures = (expiredLock ? 0 : (row?.failures ?? 0)) + 1;
  const lockedUntil = failures >= MAX_LOGIN_FAILURES ? new Date(now.getTime() + LOCK_MINUTES * 60_000) : null;
  await db
    .insert(authThrottle)
    .values({ keyHash: key, failures: lockedUntil ? 0 : failures, lockedUntil })
    .onConflictDoUpdate({
      target: authThrottle.keyHash,
      set: { failures: lockedUntil ? 0 : failures, lockedUntil },
    });
  return lockedUntil
    ? { locked: true, minutesLeft: LOCK_MINUTES }
    : { locked: false, remaining: MAX_LOGIN_FAILURES - failures };
}

export async function clearLoginFailures(db: DbOrTx, email: string): Promise<void> {
  await db.delete(authThrottle).where(eq(authThrottle.keyHash, keyOf(email)));
}
