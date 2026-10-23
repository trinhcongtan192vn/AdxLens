import type { Queue } from 'bullmq';
import type { QueueName } from '@adxlens/jobs';

/** Job định kỳ (L3 7.2, L2 9). Feature sau thêm lịch của mình vào đây. */
export const SCHEDULES: { queue: QueueName; name: string; every?: number; pattern?: string }[] = [
  { queue: 'ops', name: 'ops:health_check', every: 5 * 60_000 },
  { queue: 'maintenance', name: 'maintenance:daily_sync_tick', pattern: '5 * * * *' },
];

export async function registerSchedules(queues: Record<QueueName, Queue>): Promise<void> {
  for (const s of SCHEDULES) {
    await queues[s.queue].upsertJobScheduler(s.name, s.every ? { every: s.every } : { pattern: s.pattern! }, {
      name: s.name,
      data: { tick: 'scheduled' },
    });
  }
}
