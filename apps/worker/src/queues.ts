import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { DEFAULT_JOB_OPTIONS, JOBS, QUEUES, jobIdFor, type Enqueue, type QueueName } from '@adxlens/jobs';

export function redisConnection(url: string): IORedis {
  // BullMQ yêu cầu maxRetriesPerRequest = null cho kết nối blocking.
  return new IORedis(url, { maxRetriesPerRequest: null });
}

export function createQueues(connection: IORedis): Record<QueueName, Queue> {
  return Object.fromEntries(
    (Object.keys(QUEUES) as QueueName[]).map((q) => [q, new Queue(q, { connection })]),
  ) as Record<QueueName, Queue>;
}

/** Enqueue thật qua BullMQ: jobId = idempotency key nên job trùng bị bỏ qua. */
export function bullEnqueue(queues: Record<QueueName, Queue>): Enqueue {
  return async (name, payload, opts) => {
    const def = JOBS[name];
    await queues[def.queue].add(name, payload, {
      ...DEFAULT_JOB_OPTIONS,
      jobId: jobIdFor(name, payload),
      ...(opts?.delayMs ? { delay: opts.delayMs } : {}),
    });
  };
}
