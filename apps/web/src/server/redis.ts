import 'server-only';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import type { FlagCache } from '@adxlens/core/flags';
import { DEFAULT_JOB_OPTIONS, JOBS, jobIdFor, type Enqueue, type QueueName } from '@adxlens/jobs';

let conn: IORedis | undefined;
export function redis(): IORedis {
  conn ??= new IORedis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });
  return conn;
}

/** Cache cờ 60 giây (L3 18.1). Redis lỗi thì đọc thẳng DB (cache trả undefined). */
export function redisFlagCache(): FlagCache {
  return {
    get: async (k) => {
      try {
        const v = await redis().get(k);
        return v === null ? undefined : v === '1';
      } catch {
        return undefined;
      }
    },
    set: async (k, v, ttl) => {
      try {
        await redis().set(k, v ? '1' : '0', 'EX', ttl);
      } catch {
        /* bỏ qua: cache không bắt buộc */
      }
    },
    del: async (k) => {
      try {
        await redis().del(k);
      } catch {
        /* bỏ qua */
      }
    },
  };
}

const queues = new Map<QueueName, Queue>();

/** Enqueue từ web (route chỉ enqueue, việc > 10 giây chạy ở worker). */
export const enqueue: Enqueue = async (name, payload, opts) => {
  const def = JOBS[name];
  let q = queues.get(def.queue);
  if (!q) {
    q = new Queue(def.queue, { connection: redis() });
    queues.set(def.queue, q);
  }
  await q.add(name, payload, {
    ...DEFAULT_JOB_OPTIONS,
    jobId: jobIdFor(name, payload),
    ...(opts?.delayMs ? { delay: opts.delayMs } : {}),
  });
};
