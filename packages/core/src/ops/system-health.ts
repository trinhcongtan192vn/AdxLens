import { desc, eq, inArray, sql } from 'drizzle-orm';
import type { DbOrTx } from '@adxlens/db';
import { schema } from '@adxlens/db';
import { systemClock, type Clock } from '@adxlens/core/shared';
import { latestExecutionCheck } from './kill-switch';
import type { ScheduleInfo } from './operations';

const { opsIncidents } = schema;

/** Lịch định kỳ quá hạn chừng này mà chưa chạy → worker có thể đang dừng. */
export const SCHEDULE_LATE_MS = 5 * 60_000;

/**
 * Sức khỏe hệ thống cho trang admin: phiên bản đang chạy, kiểm thực thi của phiên bản đó, sự cố đang mở theo mức,
 * smoke sau deploy gần nhất, lịch định kỳ (trễ = worker có thể đang dừng). Chỉ dữ liệu vận hành.
 */
export async function systemHealth(
  db: DbOrTx,
  input: { appVersion: string; schedules: ScheduleInfo[] | null },
  clock: Clock = systemClock,
) {
  const now = clock.now().getTime();
  const [executionCheck, bySeverity, [smoke]] = await Promise.all([
    latestExecutionCheck(db, input.appVersion),
    db
      .select({ severity: opsIncidents.severity, n: sql<number>`count(*)::int` })
      .from(opsIncidents)
      .where(inArray(opsIncidents.status, ['open', 'mitigated']))
      .groupBy(opsIncidents.severity),
    db
      .select({
        id: opsIncidents.id,
        title: opsIncidents.title,
        status: opsIncidents.status,
        createdAt: opsIncidents.createdAt,
        resolvedAt: opsIncidents.resolvedAt,
      })
      .from(opsIncidents)
      .where(eq(opsIncidents.fingerprint, 'deploy_smoke'))
      .orderBy(desc(opsIncidents.createdAt))
      .limit(1),
  ]);
  const openIncidents = { P1: 0, P2: 0, P3: 0 };
  for (const r of bySeverity) openIncidents[r.severity] = r.n;
  return {
    appVersion: input.appVersion,
    executionCheck: executionCheck
      ? { passed: executionCheck.passed, appEnv: executionCheck.appEnv, ranAt: executionCheck.ranAt }
      : null,
    openIncidents,
    deploySmoke: smoke ?? null,
    schedules:
      input.schedules?.map((s) => ({ ...s, late: s.next !== null && s.next.getTime() < now - SCHEDULE_LATE_MS })) ??
      null,
  };
}
