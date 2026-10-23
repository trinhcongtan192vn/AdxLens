import 'server-only';
import { Queue } from 'bullmq';
import type { QueueAdmin } from '@adxlens/core/ops';
import { QUEUES, type QueueName } from '@adxlens/jobs';
import { redis } from './redis';

let override: QueueAdmin | null = null;
/** Test thay hàng đợi bằng bản giả. */
export function setQueueAdminForTests(q: QueueAdmin | null): void {
  override = q;
}

const open = new Map<string, Queue>();
function queue(name: string): Queue | null {
  if (!Object.hasOwn(QUEUES, name)) return null;
  let q = open.get(name);
  if (!q) {
    q = new Queue(name as QueueName, { connection: redis() });
    open.set(name, q);
  }
  return q;
}

/** Cổng BullMQ cho trang vận hành admin. Không bao giờ trả payload của job. */
export function queueAdmin(): QueueAdmin {
  if (override) return override;
  return {
    counts: async () =>
      Promise.all(
        Object.keys(QUEUES).map(async (name) => {
          const c = await queue(name)!.getJobCounts('waiting', 'active', 'delayed', 'failed');
          return {
            queue: name,
            waiting: c.waiting ?? 0,
            active: c.active ?? 0,
            delayed: c.delayed ?? 0,
            failed: c.failed ?? 0,
          };
        }),
      ),
    failed: async (name, limit) => {
      const q = queue(name);
      if (!q) return [];
      const jobs = await q.getFailed(0, Math.max(0, limit - 1));
      return jobs.map((j) => ({
        id: String(j.id),
        name: j.name,
        reason: j.failedReason ?? null,
        attempts: j.attemptsMade,
        failedAt: j.finishedOn ? new Date(j.finishedOn) : null,
      }));
    },
    retry: async (name, id) => {
      const j = await queue(name)?.getJob(id);
      if (!j || !(await j.isFailed())) return false;
      await j.retry('failed');
      return true;
    },
    remove: async (name, id) => {
      const j = await queue(name)?.getJob(id);
      if (!j || !(await j.isFailed())) return false;
      await j.remove();
      return true;
    },
  };
}
