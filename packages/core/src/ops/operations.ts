import { and, desc, eq, gte, lt, or, sql } from 'drizzle-orm';
import type { DbOrTx } from '@adxlens/db';
import { schema } from '@adxlens/db';
import { startManualSync } from '@adxlens/core/ingestion';
import type { Enqueue } from '@adxlens/jobs';
import { addDays, AppError, forbidden, localDate, notFound, systemClock, type Clock } from '@adxlens/core/shared';
import { recordAdminAction, type StaffActor } from './staff';

const { syncRuns, adAccounts, workspaces, jobAudit, metaConnections } = schema;

/** Lần đồng bộ "đang chạy" lâu hơn mức này coi là kẹt (khớp playbook `worker_stuck`). */
export const SYNC_STUCK_AFTER_MS = 3 * 3600_000;

/**
 * Đồng bộ lỗi (7 ngày) hoặc kẹt trên mọi workspace cho trang vận hành. XUYÊN WORKSPACE có chủ đích (CLAUDE.md quy
 * tắc 1): chỉ route staff gọi; chỉ trả thông tin vận hành (mã lỗi ngắn, không có thông điệp thô của Meta).
 */
export async function syncIssues(db: DbOrTx, clock: Clock = systemClock) {
  const now = clock.now().getTime();
  return db
    .select({
      id: syncRuns.id,
      workspaceId: syncRuns.workspaceId,
      workspaceName: workspaces.name,
      adAccountId: syncRuns.adAccountId,
      accountName: adAccounts.name,
      metaAccountId: adAccounts.metaAccountId,
      kind: syncRuns.kind,
      status: syncRuns.status,
      dateFrom: syncRuns.dateFrom,
      dateTo: syncRuns.dateTo,
      error: syncRuns.error,
      startedAt: syncRuns.startedAt,
      finishedAt: syncRuns.finishedAt,
    })
    .from(syncRuns)
    .innerJoin(adAccounts, eq(adAccounts.id, syncRuns.adAccountId))
    .innerJoin(workspaces, eq(workspaces.id, syncRuns.workspaceId))
    .innerJoin(metaConnections, eq(metaConnections.id, adAccounts.connectionId))
    .where(
      and(
        sql`${metaConnections.status} <> 'revoked'`,
        or(
          and(eq(syncRuns.status, 'failed'), gte(syncRuns.finishedAt, new Date(now - 7 * 86_400_000))),
          and(eq(syncRuns.status, 'running'), lt(syncRuns.startedAt, new Date(now - SYNC_STUCK_AFTER_MS))),
        ),
      ),
    )
    .orderBy(desc(sql`coalesce(${syncRuns.finishedAt}, ${syncRuns.startedAt})`))
    .limit(200);
}

/**
 * Staff chạy lại đồng bộ một tài khoản QC (`days` ngày gần nhất, đến hôm qua theo múi giờ tài khoản), như nút D04 của
 * khách. Ghi nhật ký admin. Tài khoản của kết nối đã ngắt không chạy được.
 */
export async function adminResync(
  db: DbOrTx,
  actor: StaffActor,
  input: { adAccountId: string; days: number; reason: string },
  deps: { enqueue: Enqueue; clock?: Clock },
) {
  const reason = input.reason.trim();
  if (reason.length < 5) throw new AppError('VALIDATION_FAILED', 'Cần nhập lý do (≥ 5 ký tự)');
  const [a] = await db
    .select({
      id: adAccounts.id,
      workspaceId: adAccounts.workspaceId,
      timezone: adAccounts.timezone,
      connectionStatus: metaConnections.status,
    })
    .from(adAccounts)
    .innerJoin(metaConnections, eq(metaConnections.id, adAccounts.connectionId))
    .where(eq(adAccounts.id, input.adAccountId));
  if (!a) throw notFound('Tài khoản QC');
  if (a.connectionStatus === 'revoked') throw new AppError('CONFLICT', 'Kết nối đã ngắt, dữ liệu đang chờ xóa');
  const yesterday = addDays(localDate((deps.clock ?? systemClock).now(), a.timezone), -1);
  const range = { from: addDays(yesterday, -(input.days - 1)), to: yesterday };
  const r = await startManualSync({ db, workspaceId: a.workspaceId }, a.id, range, deps);
  await recordAdminAction(db, {
    actorUserId: actor.userId,
    action: 'sync.resync',
    targetType: 'ad_account',
    targetId: a.id,
    workspaceId: a.workspaceId,
    reason,
    detail: { ...range, syncRunId: r.syncRunId },
  });
  return { ...r, ...range };
}

/** Mã lỗi rate limit của Meta (L3 6.2), như `meta-client/errors.ts`. */
const RATE_LIMIT_SQL = sql`(${jobAudit.errorCode} in (4, 17, 32, 613) or ${jobAudit.errorCode} between 80000 and 80014)`;

/** Mức dùng Meta API trong `minutes` phút gần nhất: tổng, lỗi, rate limit, top workspace. Xuyên workspace (staff). */
export async function metaApiUsage(db: DbOrTx, opts: { minutes?: number } = {}, clock: Clock = systemClock) {
  const since = new Date(clock.now().getTime() - (opts.minutes ?? 60) * 60_000);
  const [totals] = await db
    .select({
      calls: sql<number>`count(*)::int`,
      errors: sql<number>`count(*) filter (where ${jobAudit.status} >= 400)::int`,
      rateLimited: sql<number>`count(*) filter (where ${RATE_LIMIT_SQL})::int`,
      avgMs: sql<number>`coalesce(round(avg(${jobAudit.durationMs})), 0)::int`,
    })
    .from(jobAudit)
    .where(gte(jobAudit.at, since));
  const top = await db
    .select({
      workspaceId: jobAudit.workspaceId,
      workspaceName: workspaces.name,
      calls: sql<number>`count(*)::int`,
      rateLimited: sql<number>`count(*) filter (where ${RATE_LIMIT_SQL})::int`,
    })
    .from(jobAudit)
    .leftJoin(workspaces, eq(workspaces.id, jobAudit.workspaceId))
    .where(gte(jobAudit.at, since))
    .groupBy(jobAudit.workspaceId, workspaces.name)
    .orderBy(desc(sql`count(*)`))
    .limit(10);
  return { since, ...(totals ?? { calls: 0, errors: 0, rateLimited: 0, avgMs: 0 }), top };
}

// ---------- Hàng đợi BullMQ ----------

export type QueueCounts = { queue: string; waiting: number; active: number; delayed: number; failed: number };
export type ScheduleInfo = {
  queue: string;
  name: string;
  pattern: string | null;
  everyMs: number | null;
  next: Date | null;
};
export type FailedJob = { id: string; name: string; reason: string | null; attempts: number; failedAt: Date | null };

/** Cổng tới BullMQ (web cài bản thật, test cài bản giả). Không bao giờ trả payload của job. */
export interface QueueAdmin {
  counts(): Promise<QueueCounts[]>;
  failed(queue: string, limit: number): Promise<FailedJob[]>;
  retry(queue: string, jobId: string): Promise<boolean>;
  remove(queue: string, jobId: string): Promise<boolean>;
  /** Lịch định kỳ (BullMQ job scheduler) và lần chạy kế tiếp. */
  schedules(): Promise<ScheduleInfo[]>;
}

/** Queue có lời gọi GHI lên Meta: không bao giờ chạy lại (ADR-0008: ghi không retry, kiểm tay trên Ads Manager). */
export const NO_RETRY_QUEUES: readonly string[] = ['execute'];

/** Che chuỗi giống token / secret trong lý do lỗi trước khi hiện ở trang admin (phòng thủ thêm, CLAUDE.md quy tắc 2). */
export function scrubJobError(reason: string | null): string | null {
  if (!reason) return null;
  return reason
    .replace(/EAA[A-Za-z0-9]{10,}/g, '[token]')
    .replace(/(access_token|token|secret|password|authorization)(["'=:\s]+)[^\s"'&,]+/gi, '$1$2[đã che]')
    .slice(0, 300);
}

export async function failedJobs(admin: QueueAdmin, queue: string, limit = 50): Promise<FailedJob[]> {
  return (await admin.failed(queue, limit)).map((j) => ({ ...j, reason: scrubJobError(j.reason) }));
}

/** Staff chạy lại hoặc bỏ một job lỗi; queue ghi Meta chỉ bỏ được. Ghi nhật ký admin. */
export async function handleFailedJob(
  db: DbOrTx,
  admin: QueueAdmin,
  actor: StaffActor,
  input: { queue: string; jobId: string; action: 'retry' | 'discard'; reason: string },
) {
  const reason = input.reason.trim();
  if (reason.length < 5) throw new AppError('VALIDATION_FAILED', 'Cần nhập lý do (≥ 5 ký tự)');
  if (input.action === 'retry' && NO_RETRY_QUEUES.includes(input.queue)) {
    throw forbidden('Không chạy lại job ghi lên Meta (ADR-0008) — kiểm tra trên Ads Manager rồi bỏ job');
  }
  const ok =
    input.action === 'retry'
      ? await admin.retry(input.queue, input.jobId)
      : await admin.remove(input.queue, input.jobId);
  if (!ok) throw notFound('Job lỗi');
  await recordAdminAction(db, {
    actorUserId: actor.userId,
    action: input.action === 'retry' ? 'queue.retry' : 'queue.discard',
    targetType: 'job',
    targetId: `${input.queue}:${input.jobId}`,
    reason,
  });
}
