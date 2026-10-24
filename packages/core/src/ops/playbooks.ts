import { and, eq, gte, lte, sql } from 'drizzle-orm';
import type { DbOrTx } from '@adxlens/db';
import { schema } from '@adxlens/db';
import { connectionExpiringEmail, notify, type EmailSender } from '@adxlens/core/notification';
import { systemClock, type Clock } from '@adxlens/core/shared';
import { registerHealthCheck, type HealthResult } from './health';
import { runWorkerStuckPlaybook } from './stuck';
import { openIncident, runPlaybook } from './incidents';

const { metaConnections, users, workspaces, jobAudit } = schema;

// ---------- token_expiring (L2 11.2) ----------

export const TOKEN_EXPIRING_DAYS = 7;

/**
 * Playbook `token_expiring` (job `maintenance:daily_tick`). Truy vấn XUYÊN WORKSPACE có chủ đích
 * (CLAUDE.md quy tắc 1): quét mọi kết nối đang hoạt động sắp hết hạn trong 7 ngày. Token dài hạn của
 * Meta không làm mới được phía server nên hành động là email người kết nối (1 lần/ngày/kết nối). Kết nối
 * đã quá hạn → đánh dấu hết hạn, mở sự cố P3 và email báo đã hết hạn.
 */
export async function runTokenExpiringPlaybook(
  db: DbOrTx,
  deps: { email: EmailSender; appUrl: string; clock?: Clock },
): Promise<{ notified: number; expired: number; skipped: number }> {
  const clock = deps.clock ?? systemClock;
  const now = clock.now();
  const soon = new Date(now.getTime() + TOKEN_EXPIRING_DAYS * 86_400_000);
  const rows = await db
    .select({
      id: metaConnections.id,
      workspaceId: metaConnections.workspaceId,
      createdBy: metaConnections.createdBy,
      expiresAt: metaConnections.expiresAt,
      email: users.email,
      locale: users.locale,
      workspaceName: workspaces.name,
    })
    .from(metaConnections)
    .innerJoin(users, eq(users.id, metaConnections.createdBy))
    .innerJoin(workspaces, eq(workspaces.id, metaConnections.workspaceId))
    .where(and(eq(metaConnections.status, 'active'), lte(metaConnections.expiresAt, soon)));
  let notified = 0;
  let expired = 0;
  let skipped = 0;
  for (const c of rows) {
    const daysLeft = Math.max(0, Math.ceil((c.expiresAt!.getTime() - now.getTime()) / 86_400_000));
    let incidentId: string | null = null;
    if (daysLeft === 0) {
      await db
        .update(metaConnections)
        .set({ status: 'expired' })
        .where(and(eq(metaConnections.workspaceId, c.workspaceId), eq(metaConnections.id, c.id)));
      expired++;
      incidentId = (
        await openIncident(db, {
          kind: 'token_expired',
          severity: 'P3',
          source: 'meta_api',
          title: 'Kết nối Meta đã hết hạn',
          fingerprint: `token:${c.id}`,
          workspaceId: c.workspaceId,
        })
      ).incident.id;
    }
    const r = await runPlaybook(
      db,
      { playbook: 'token_expiring', scopeKey: c.id, workspaceId: c.workspaceId, incidentId },
      async () => {
        await deps.email.send(
          connectionExpiringEmail({
            locale: c.locale === 'en' ? 'en' : 'vi',
            to: c.email,
            workspaceName: c.workspaceName,
            daysLeft,
            link: `${deps.appUrl}/connections`,
          }),
        );
        return { days_left: daysLeft };
      },
      clock,
    );
    if (r === 'done') {
      notified++;
      // Trung tâm thông báo (P0-25): cùng nội dung email vừa gửi.
      await notify(
        { db, workspaceId: c.workspaceId },
        {
          kind: daysLeft === 0 ? 'token_expired' : 'token_expiring',
          recipients: { userIds: [c.createdBy] },
          params: { days: daysLeft },
          link: '/connections',
          dedupeKey: `token:${c.id}:${now.toISOString().slice(0, 10)}`,
          email: false,
        },
      );
    } else skipped++;
  }
  return { notified, expired, skipped };
}

// ---------- meta_rate_limited (L2 11.2) ----------

/** Cửa sổ quan sát và ngưỡng: ≥ 20 lời gọi trong 15 phút, > 20% bị rate limit. */
export const RATE_LIMIT_WINDOW_MS = 15 * 60_000;
export const RATE_LIMIT_MIN_CALLS = 20;
export const RATE_LIMIT_MAX_RATIO = 0.2;
/** Hành động: hoãn queue `sync` 15 phút (giảm tải Meta), tối đa 3 lần/giờ rồi leo thang. */
export const RATE_LIMIT_PAUSE_MS = 15 * 60_000;

/** Tỷ lệ lời gọi Meta bị rate limit gần đây (job_audit toàn hệ thống — dữ liệu vận hành). */
export async function metaRateLimitRatio(db: DbOrTx, clock: Clock = systemClock): Promise<HealthResult> {
  const since = new Date(clock.now().getTime() - RATE_LIMIT_WINDOW_MS);
  const [r] = await db
    .select({
      total: sql<number>`count(*)::int`,
      limited: sql<number>`(count(*) filter (where ${jobAudit.status} = 429 or ${jobAudit.errorCode} in (4, 17, 32, 613) or ${jobAudit.errorCode} between 80000 and 80014))::int`,
    })
    .from(jobAudit)
    .where(gte(jobAudit.at, since));
  const total = r?.total ?? 0;
  const limited = r?.limited ?? 0;
  const ratio = total ? limited / total : 0;
  return {
    ok: total < RATE_LIMIT_MIN_CALLS || ratio <= RATE_LIMIT_MAX_RATIO,
    detail: { total, limited, ratio: Number(ratio.toFixed(3)) },
  };
}

registerHealthCheck({ name: 'meta_rate_limit', severity: 'P2', run: (db) => metaRateLimitRatio(db) });

/** Sau `ops:health_check`: kiểm tra rate limit lỗi → playbook `meta_rate_limited` hoãn queue sync. */
export async function remediateHealth(
  db: DbOrTx,
  results: Record<string, HealthResult>,
  actions: { throttleQueue?: (queue: 'sync', ms: number) => Promise<void> },
  clock: Clock = systemClock,
): Promise<Record<string, 'done' | 'failed' | 'escalated'>> {
  const out: Record<string, 'done' | 'failed' | 'escalated'> = {};
  const rl = results.meta_rate_limit;
  if (rl && !rl.ok && actions.throttleQueue) {
    const throttle = actions.throttleQueue;
    out.meta_rate_limited = await runPlaybook(
      db,
      { playbook: 'meta_rate_limited', scopeKey: 'global' },
      async () => {
        await throttle('sync', RATE_LIMIT_PAUSE_MS);
        return { paused_ms: RATE_LIMIT_PAUSE_MS, ...rl.detail };
      },
      clock,
    );
  }
  // worker_stuck: hành động / đồng bộ kẹt (không chạy lại lời gọi ghi).
  const stuck = results.stuck_work;
  if (stuck && !stuck.ok) {
    const r = await runWorkerStuckPlaybook(db, clock);
    if (r.result !== 'ok') out.worker_stuck = r.result;
  }
  return out;
}
