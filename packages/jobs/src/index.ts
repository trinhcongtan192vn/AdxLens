import { z } from 'zod';

/** Queue và concurrency theo L3 mục 7.1. */
export const QUEUES = {
  sync: { concurrency: 3 },
  reconcile: { concurrency: 3 },
  audit: { concurrency: 2 },
  recommend: { concurrency: 2 },
  report: { concurrency: 2 },
  pdf: { concurrency: 1 },
  notify: { concurrency: 5 },
  execute: { concurrency: 1 },
  rules: { concurrency: 2 },
  ops: { concurrency: 2 },
  maintenance: { concurrency: 1 },
} as const;
export type QueueName = keyof typeof QUEUES;

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const ws = { workspaceId: uuid };

type JobDef<S extends z.ZodTypeAny> = {
  queue: QueueName;
  schema: S;
  /** Idempotency key (L2 mục 9); BullMQ từ chối job trùng jobId. */
  jobId: (p: z.infer<S>) => string;
  /** false = job hệ thống chạy cho mọi workspace (chỉ module ops/maintenance). */
  workspaceScoped: boolean;
};

const def = <S extends z.ZodTypeAny>(d: JobDef<S>) => d;

/**
 * Danh mục job (`<queue>:<verb>`, L3 7.2). Mọi job theo workspace mang workspaceId và handler
 * phải lọc theo nó; bộ test cách ly workspace duyệt danh sách này.
 */
export const JOBS = {
  'sync:refresh_accounts': def({
    queue: 'sync',
    workspaceScoped: true,
    schema: z.object({ ...ws, connectionId: uuid }),
    jobId: (p) => `sync:refresh:${p.connectionId}:${Math.floor(Date.now() / 60_000)}`,
  }),
  'sync:backfill_account': def({
    queue: 'sync',
    workspaceScoped: true,
    schema: z.object({ ...ws, adAccountId: uuid, from: isoDate, to: isoDate, syncRunId: uuid }),
    jobId: (p) => `sync:backfill:${p.syncRunId}:${p.from}:${p.to}`,
  }),
  'sync:daily_account': def({
    queue: 'sync',
    workspaceScoped: true,
    schema: z.object({ ...ws, adAccountId: uuid, date: isoDate }),
    jobId: (p) => `sync:daily:${p.adAccountId}:${p.date}`,
  }),
  'reconcile:account': def({
    queue: 'reconcile',
    workspaceScoped: true,
    schema: z.object({ ...ws, adAccountId: uuid, from: isoDate, to: isoDate }),
    jobId: (p) => `reconcile:${p.adAccountId}:${p.from}:${p.to}`,
  }),
  'audit:run': def({
    queue: 'audit',
    workspaceScoped: true,
    schema: z.object({ ...ws, adAccountId: uuid, snapshotVersion: z.string() }),
    jobId: (p) => `audit:${p.adAccountId}:${p.snapshotVersion}`,
  }),
  'recommend:build': def({
    queue: 'recommend',
    workspaceScoped: true,
    schema: z.object({ ...ws, week: isoDate }),
    jobId: (p) => `recommend:${p.workspaceId}:${p.week}`,
  }),
  'report:build': def({
    queue: 'report',
    workspaceScoped: true,
    schema: z.object({ ...ws, reportId: uuid }),
    jobId: (p) => `report:${p.reportId}`,
  }),
  'pdf:render': def({
    queue: 'pdf',
    workspaceScoped: true,
    schema: z.object({ ...ws, reportId: uuid, version: z.string() }),
    jobId: (p) => `pdf:${p.reportId}:${p.version}`,
  }),
  'notify:send_email': def({
    queue: 'notify',
    workspaceScoped: true,
    schema: z.object({ ...ws, notificationId: uuid }),
    jobId: (p) => `notify:email:${p.notificationId}`,
  }),
  'notify:digest': def({
    queue: 'notify',
    workspaceScoped: true,
    schema: z.object({ ...ws, week: isoDate }),
    jobId: (p) => `notify:digest:${p.workspaceId}:${p.week}`,
  }),
  'notify:scheduled_report': def({
    queue: 'notify',
    workspaceScoped: true,
    schema: z.object({ ...ws, scheduleId: uuid, period: z.string() }),
    jobId: (p) => `notify:schedule:${p.scheduleId}:${p.period}`,
  }),
  'execute:action': def({
    queue: 'execute',
    workspaceScoped: true,
    schema: z.object({ ...ws, actionId: uuid }),
    jobId: (p) => `execute:${p.actionId}`,
  }),
  'rules:evaluate': def({
    queue: 'rules',
    workspaceScoped: true,
    schema: z.object({ ...ws, ruleId: uuid, tick: z.string() }),
    jobId: (p) => `rules:${p.ruleId}:${p.tick}`,
  }),
  'rules:shadow_evaluate': def({
    queue: 'rules',
    workspaceScoped: true,
    schema: z.object({ ...ws, ruleId: uuid, tick: z.string() }),
    jobId: (p) => `rules:shadow:${p.ruleId}:${p.tick}`,
  }),
  'maintenance:purge_connection_data': def({
    queue: 'maintenance',
    workspaceScoped: true,
    schema: z.object({ ...ws, connectionId: uuid }),
    jobId: (p) => `purge:${p.connectionId}`,
  }),
  'ops:health_check': def({
    queue: 'ops',
    workspaceScoped: false,
    schema: z.object({ tick: z.string() }),
    jobId: (p) => `health:${p.tick}`,
  }),
  'ops:auto_remediate': def({
    queue: 'ops',
    workspaceScoped: false,
    schema: z.object({ incidentId: uuid, playbook: z.string() }),
    jobId: (p) => `remediate:${p.incidentId}:${p.playbook}`,
  }),
  // Mỗi giờ: tìm tài khoản đang 03:00 giờ địa phương và enqueue `sync:daily_account` (L3 6.3).
  'maintenance:daily_sync_tick': def({
    queue: 'maintenance',
    workspaceScoped: false,
    schema: z.object({ tick: z.string() }),
    jobId: (p) => `daily_sync:${p.tick}`,
  }),
  'maintenance:daily_tick': def({
    queue: 'maintenance',
    workspaceScoped: false,
    schema: z.object({ tick: z.string() }),
    jobId: (p) => `daily:${p.tick}`,
  }),
} as const;

export type JobName = keyof typeof JOBS;
export type JobPayload<N extends JobName> = z.infer<(typeof JOBS)[N]['schema']>;
export const JOB_NAMES = Object.keys(JOBS) as JobName[];

/** Validate payload khi nhận (L3 7.2). Ném ZodError nếu sai. */
export function parsePayload<N extends JobName>(name: N, data: unknown): JobPayload<N> {
  return JOBS[name].schema.parse(data) as JobPayload<N>;
}

export function jobIdFor<N extends JobName>(name: N, payload: JobPayload<N>): string {
  return (JOBS[name].jobId as (p: JobPayload<N>) => string)(payload).replaceAll(':', '_');
}

/** Cổng enqueue: core nhận interface này thay vì import BullMQ (CLAUDE.md). */
export type Enqueue = <N extends JobName>(
  name: N,
  payload: JobPayload<N>,
  opts?: { delayMs?: number },
) => Promise<void>;

/** Retry: 5 lần, backoff mũ từ 30 giây (L3 7.2). */
export const DEFAULT_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 30_000 },
  removeOnComplete: { age: 7 * 86_400, count: 5_000 },
  removeOnFail: { age: 30 * 86_400 },
};

/** Enqueue ghi vào mảng, dùng trong test. */
export function recordingEnqueue(): Enqueue & {
  calls: { name: JobName; payload: unknown; opts?: { delayMs?: number } }[];
} {
  const calls: { name: JobName; payload: unknown; opts?: { delayMs?: number } }[] = [];
  const fn = (async (name, payload, opts) => {
    calls.push(opts ? { name, payload, opts } : { name, payload });
  }) as Enqueue & { calls: typeof calls };
  fn.calls = calls;
  return fn;
}
