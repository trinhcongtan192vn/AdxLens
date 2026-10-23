import 'server-only';
import IORedis from 'ioredis';

/** L3 10.1: 600 request/phút/workspace. Request chưa gắn workspace tính theo user. */
export const API_LIMIT_PER_MINUTE = 600;

export type RateLimiter = {
  hit(key: string, limit: number, windowSec: number): Promise<{ allowed: boolean; remaining: number }>;
};

let conn: IORedis | undefined;

/** Cửa sổ cố định bằng INCR + EXPIRE. Redis lỗi → cho qua (không chặn người dùng vì hạ tầng cache). */
export function redisRateLimiter(): RateLimiter {
  return {
    async hit(key, limit, windowSec) {
      try {
        conn ??= new IORedis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', {
          maxRetriesPerRequest: 1,
          lazyConnect: true,
        });
        const bucket = `rl:${key}:${Math.floor(Date.now() / 1000 / windowSec)}`;
        const n = await conn.incr(bucket);
        if (n === 1) await conn.expire(bucket, windowSec + 1);
        return { allowed: n <= limit, remaining: Math.max(0, limit - n) };
      } catch {
        return { allowed: true, remaining: limit };
      }
    },
  };
}

export function memoryRateLimiter(): RateLimiter & { counts: Map<string, number> } {
  const counts = new Map<string, number>();
  return {
    counts,
    async hit(key, limit) {
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      return { allowed: n <= limit, remaining: Math.max(0, limit - n) };
    },
  };
}
