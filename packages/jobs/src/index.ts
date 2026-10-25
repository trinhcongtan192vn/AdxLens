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
  // ADR-0029: đồng bộ số liệu cửa hàng / GA4 của một kết nối (vừa kết nối: 30 ngày; hằng ngày: 3 ngày).
  'sync:store_daily': def({
    queue: 'sync',
    workspaceScoped: true,
    schema: z.object({ ...ws, connectionId: uuid, days: z.number().int().min(1).max(60), tick: z.string() }),
    jobId: (p) => `store:${p.connectionId}:${p.tick}`,
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
  /** ADR-0019: trả lời AI agent (LLM tool-use, có thể > 10 giây nên chạy ở worker). */
  // ADR-0027: AI tạo ảnh cho bản nháp creative (khóa OpenAI của workspace, giải mã trong worker).
  'recommend:creative_image': def({
    queue: 'recommend',
    workspaceScoped: true,
    schema: z.object({ ...ws, draftId: uuid }),
    jobId: (p) => `creative_image:${p.draftId}`,
  }),
  'recommend:agent_reply': def({
    queue: 'recommend',
    workspaceScoped: true,
    schema: z.object({ ...ws, messageId: uuid }),
    jobId: (p) => `agent:${p.messageId}`,
  }),
  'report:build': def({
    queue: 'report',
    workspaceScoped: true,
    schema: z.object({ ...ws, reportId: uuid }),
    // Theo giây: dựng lại (R03) không bị trùng job cũ còn lưu.
    jobId: (p) => `report:${p.reportId}:${Math.floor(Date.now() / 1000)}`,
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
    // Theo phút: duyệt rồi gửi lại cùng kỳ không bị trùng job cũ; chống trùng kỳ nằm ở report_deliveries.
    jobId: (p) => `notify:schedule:${p.scheduleId}:${p.period}:${Math.floor(Date.now() / 60_000)}`,
  }),
  'execute:action': def({
    queue: 'execute',
    workspaceScoped: true,
    schema: z.object({ ...ws, actionId: uuid }),
    jobId: (p) => `execute:${p.actionId}`,
  }),
  // ADR-0021: một lịch hẹn của rule đến hạn (trả ngân sách / đề xuất bật lại). `tick` cho phép thử lại lần sau.
  'execute:revert': def({
    queue: 'execute',
    workspaceScoped: true,
    schema: z.object({ ...ws, revertId: uuid, tick: z.string() }),
    jobId: (p) => `revert:${p.revertId}:${p.tick}`,
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
  // Mỗi giờ: lịch gửi báo cáo đến giờ (theo múi giờ của lịch) → enqueue `notify:scheduled_report`.
  'maintenance:report_tick': def({
    queue: 'maintenance',
    workspaceScoped: false,
    schema: z.object({ tick: z.string() }),
    jobId: (p) => `report_tick:${p.tick}`,
  }),
  // Mỗi 30 phút: rule tự động shadow / live → enqueue đánh giá từng rule (P2b, ADR-0012).
  'maintenance:rules_tick': def({
    queue: 'maintenance',
    workspaceScoped: false,
    schema: z.object({ tick: z.string() }),
    jobId: (p) => `rules_tick:${p.tick}`,
  }),
  // Mỗi 15 phút: lịch hẹn của rule đến hạn → enqueue `execute:revert` (ADR-0021).
  'maintenance:reverts_tick': def({
    queue: 'maintenance',
    workspaceScoped: false,
    schema: z.object({ tick: z.string() }),
    jobId: (p) => `reverts_tick:${p.tick}`,
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
