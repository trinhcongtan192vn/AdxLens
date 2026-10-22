import { Worker } from 'bullmq';
import { getEnv } from '@adxlens/config/env';
import { getDb } from '@adxlens/db';
import { registerHealthCheck } from '@adxlens/core/ops';
import { rootLogger } from '@adxlens/core/shared';
import { QUEUES, type QueueName } from '@adxlens/jobs';
import { dispatch } from './dispatch';
import { handlers } from './handlers';
import { bullEnqueue, createQueues, redisConnection } from './queues';
import { registerSchedules } from './schedules';

const env = getEnv();
const log = rootLogger();
const connection = redisConnection(env.REDIS_URL);
const queues = createQueues(connection);
const enqueue = bullEnqueue(queues);
const db = getDb(env.DATABASE_URL);

// Tín hiệu sức khỏe: backlog queue sync (L3 mục 12: > 100 → cảnh báo).
registerHealthCheck({
  name: 'queue_backlog_sync',
  severity: 'P2',
  run: async () => {
    const waiting = await queues.sync.getWaitingCount();
    return { ok: waiting <= 100, detail: { waiting } };
  },
});

const workers = (Object.keys(QUEUES) as QueueName[]).map(
  (q) =>
    new Worker(
      q,
      (job) =>
        dispatch(handlers, { db, enqueue }, { name: job.name, id: job.id ?? '', data: job.data }),
      {
        connection,
        concurrency: QUEUES[q].concurrency,
      },
    ),
);

for (const w of workers) {
  w.on('failed', (job, err) => {
    log.error({ job_id: job?.id, job: job?.name, err }, 'job thất bại');
  });
}

await registerSchedules(queues);
log.info({ queues: Object.keys(QUEUES) }, 'worker đã chạy');

async function shutdown() {
  await Promise.all(workers.map((w) => w.close()));
  await connection.quit();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
