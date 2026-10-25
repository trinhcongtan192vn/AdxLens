import { and, eq, lt } from 'drizzle-orm';
import type { DbOrTx } from '@adxlens/db';
import { schema } from '@adxlens/db';
import { systemClock, type Clock } from '@adxlens/core/shared';
import { registerHealthCheck } from './health';
import { openIncident, recordPlaybookRun, resolveIncidentsByFingerprint, runPlaybook } from './incidents';

const { actions, actionLogs, syncRuns } = schema;

/** Hành động "đang thực hiện" quá lâu → worker kẹt giữa chừng (L2 11.2 `worker_stuck`). */
export const STUCK_EXECUTION_MS = 15 * 60_000;
/** Lần đồng bộ "đang chạy" quá lâu không xong. */
export const STALLED_SYNC_MS = 3 * 3_600_000;

/**
 * Tín hiệu kẹt — truy vấn XUYÊN WORKSPACE có chủ đích (dữ liệu vận hành, chỉ định danh).
 */
export async function stuckWork(db: DbOrTx, clock: Clock = systemClock) {
  const now = clock.now().getTime();
  const stuckActions = await db
    .select({ id: actions.id, workspaceId: actions.workspaceId, adAccountId: actions.adAccountId })
    .from(actions)
    .where(and(eq(actions.status, 'executing'), lt(actions.updatedAt, new Date(now - STUCK_EXECUTION_MS))));
  const stalledRuns = await db
    .select({ id: syncRuns.id, workspaceId: syncRuns.workspaceId })
    .from(syncRuns)
    .where(and(eq(syncRuns.status, 'running'), lt(syncRuns.startedAt, new Date(now - STALLED_SYNC_MS))));
  return { stuckActions, stalledRuns };
}

registerHealthCheck({
  name: 'stuck_work',
  severity: 'P2',
  run: async (db) => {
    const s = await stuckWork(db);
    return {
      ok: s.stuckActions.length === 0 && s.stalledRuns.length === 0,
      detail: { stuck_actions: s.stuckActions.length, stalled_runs: s.stalledRuns.length },
    };
  },
});

/**
 * Playbook `worker_stuck` (L2 11.2, tối đa 3 lần/giờ):
 * - Hành động kẹt ở "đang thực hiện": KHÔNG chạy lại lời gọi ghi (ADR-0008) — đánh dấu thất bại "cần kiểm tra
 *   thủ công trên Ads Manager", mở sự cố P1 (thực thi luôn là P1).
 * - Đồng bộ kẹt: đánh dấu thất bại `stalled` để người dùng / lần đồng bộ sau chạy lại.
 * Vượt giới hạn → leo thang (báo PM).
 */
export async function runWorkerStuckPlaybook(db: DbOrTx, clock: Clock = systemClock) {
  const s = await stuckWork(db, clock);
  if (!s.stuckActions.length && !s.stalledRuns.length) {
    await resolveIncidentsByFingerprint(db, 'worker_stuck', clock);
    return { result: 'ok' as const, actions: 0, runs: 0 };
  }
  const now = clock.now();
  const { incident } = await openIncident(db, {
    kind: 'worker_stuck',
    severity: s.stuckActions.length ? 'P1' : 'P2',
    source: 'health_check',
    title: s.stuckActions.length ? 'Hành động trên Meta bị kẹt khi thực hiện' : 'Đồng bộ bị kẹt',
    fingerprint: 'worker_stuck',
    detail: { stuck_actions: s.stuckActions.map((a) => a.id), stalled_runs: s.stalledRuns.map((r) => r.id) },
  });
  const result = await runPlaybook(
    db,
    { playbook: 'worker_stuck', scopeKey: 'global', incidentId: incident.id },
    async () => {
      for (const a of s.stuckActions) {
        await db
          .update(actions)
          .set({
            status: 'failed',
            resultCode: 'stuck_check_manually',
            errorMessage: 'Worker dừng giữa chừng',
            updatedAt: now,
          })
          .where(and(eq(actions.workspaceId, a.workspaceId), eq(actions.id, a.id), eq(actions.status, 'executing')));
        await db.insert(actionLogs).values({
          workspaceId: a.workspaceId,
          actionId: a.id,
          event: 'failed',
          detail: { result: 'stuck_check_manually' },
        });
      }
      for (const r of s.stalledRuns) {
        await db
          .update(syncRuns)
          .set({ status: 'failed', error: 'stalled', finishedAt: now })
          .where(and(eq(syncRuns.workspaceId, r.workspaceId), eq(syncRuns.id, r.id), eq(syncRuns.status, 'running')));
      }
      return { actions: s.stuckActions.length, runs: s.stalledRuns.length };
    },
    clock,
  );
  return { result, actions: s.stuckActions.length, runs: s.stalledRuns.length };
}

/**
 * Playbook `deploy_smoke_failed` (L2 11.2): smoke test sau deploy thất bại → sự cố P1, luôn báo PM; rollback do
 * nền tảng deploy thực hiện (PM). Đạt → đóng sự cố smoke đang mở.
 */
export async function recordDeploySmoke(
  db: DbOrTx,
  input: { appVersion: string; ok: boolean; failures: string[] },
  clock: Clock = systemClock,
) {
  if (input.ok) {
    await resolveIncidentsByFingerprint(db, 'deploy_smoke', clock);
    return { incident: null };
  }
  const { incident } = await openIncident(db, {
    kind: 'deploy_smoke_failed',
    severity: 'P1',
    source: 'deploy',
    title: `Smoke test sau deploy thất bại (${input.appVersion})`,
    fingerprint: 'deploy_smoke',
    detail: { app_version: input.appVersion, failures: input.failures },
  });
  await recordPlaybookRun(
    db,
    {
      playbook: 'deploy_smoke_failed',
      scopeKey: input.appVersion,
      result: 'escalated',
      incidentId: incident.id,
      detail: { failures: input.failures },
    },
    clock,
  );
  return { incident };
}
