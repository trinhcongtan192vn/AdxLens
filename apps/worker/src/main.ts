import { Worker } from 'bullmq';
import { getEnv } from '@adxlens/config/env';
import { getDb } from '@adxlens/db';
import { keysFromEnv, metaReadApi, recordMetaCall } from '@adxlens/core/connections';
import { createMetaWriter } from '@adxlens/core/execution';
import { smtpEmailSender } from '@adxlens/core/notification';
import {
  mergeAlertRecipients,
  opsAlertEmails,
  registerHealthCheck,
  registerIncidentSink,
  teamAlertSink,
} from '@adxlens/core/ops';
import { anthropicClient } from '@adxlens/core/reporting';
import { signPayload } from '@adxlens/core/shared';
import { closeRenderer, renderPdf, supabaseWorkerStorage } from './render';
import { rootLogger } from '@adxlens/core/shared';
import { QUEUES, type QueueName } from '@adxlens/jobs';
import { dispatch } from './dispatch';
import type { WorkerServices } from './handler';
import { handlers } from './handlers';
import { bullEnqueue, createQueues, redisConnection } from './queues';
import { registerSchedules } from './schedules';

const env = getEnv();
if (env.META_MOCK && (env.APP_ENV === 'staging' || env.APP_ENV === 'production')) {
  throw new Error('META_MOCK chỉ dùng ở local/test');
}
const log = rootLogger();
const connection = redisConnection(env.REDIS_URL);
const queues = createQueues(connection);
const enqueue = bullEnqueue(queues);
const db = getDb(env.DATABASE_URL);

const services: WorkerServices = {
  db,
  enqueue,
  // Mọi lời gọi Meta ghi job_audit (L3 6.2), không ghi token.
  meta: metaReadApi({
    mock: env.META_MOCK,
    apiVersion: env.META_API_VERSION,
    appId: env.META_APP_ID,
    appSecret: env.META_APP_SECRET,
    onAudit: (a) => recordMetaCall(db, null, a).catch(() => undefined),
  }),
  tokenKeys: keysFromEnv(env).keys,
  metaWriter: createMetaWriter({
    mock: env.META_MOCK,
    apiVersion: env.META_API_VERSION,
    appSecret: env.META_APP_SECRET,
    onAudit: (a) => recordMetaCall(db, null, a).catch(() => undefined),
  }),
  email: smtpEmailSender({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    from: env.EMAIL_FROM,
  }),
  appUrl: env.APP_URL,
  publicReportUrl: env.PUBLIC_REPORT_URL,
  renderPdf,
  uploadReport: (path, bytes) => {
    if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Thiếu SUPABASE_SERVICE_ROLE_KEY');
    return supabaseWorkerStorage(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY).upload(
      'reports',
      path,
      bytes,
      'application/pdf',
    );
  },
  sign: (payload, ttl) => signPayload(payload, ttl, env.INTERNAL_SIGNING_SECRET),
  llm: env.ANTHROPIC_API_KEY ? anthropicClient({ apiKey: env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_MODEL }) : null,
  throttleQueue: (q, ms) => queues[q].rateLimit(ms),
};

// Kênh báo đội AdxLens cho sự cố P1/P2 (043). Email: `OPS_ALERT_EMAILS` + danh sách đặt ở admin (đọc lúc gửi).
registerIncidentSink(async (a) => {
  const recipients = mergeAlertRecipients(env.OPS_ALERT_EMAILS, await opsAlertEmails(db));
  if (!recipients.length && !env.OPS_SLACK_WEBHOOK_URL) return;
  await teamAlertSink({
    email: services.email,
    recipients,
    slackWebhookUrl: env.OPS_SLACK_WEBHOOK_URL,
    appUrl: env.APP_URL,
  })(a);
});

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
        dispatch(handlers, services, {
          name: job.name,
          id: job.id ?? '',
          data: job.data,
          attempt: job.attemptsMade + 1,
          maxAttempts: job.opts.attempts ?? 1,
        }),
      { connection, concurrency: QUEUES[q].concurrency },
    ),
);

for (const w of workers) {
  w.on('failed', (job, err) => {
    log.error({ job_id: job?.id, job: job?.name, err }, 'job thất bại');
  });
}

await registerSchedules(queues);
log.info({ queues: Object.keys(QUEUES), meta_mock: env.META_MOCK }, 'worker đã chạy');

async function shutdown() {
  await Promise.all(workers.map((w) => w.close()));
  await closeRenderer();
  await connection.quit();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
