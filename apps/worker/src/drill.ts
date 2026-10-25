import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { setSubscription } from '@adxlens/core/billing';
import { importAccounts, saveConnection, setWriteEnabled, type TokenKeys } from '@adxlens/core/connections';
import {
  executeAction,
  GUARDRAIL_DEFAULTS,
  newMockMetaWriter,
  requestAction,
  saveGuardrails,
} from '@adxlens/core/execution';
import { enableFlag } from '@adxlens/core/flags';
import { startBackfill, syncRange } from '@adxlens/core/ingestion';
import { listIncidents, remediateHealth, resolveIncidentsByFingerprint, runHealthChecks } from '@adxlens/core/ops';
import { reconcileAccount } from '@adxlens/core/reconciliation';
import { addDays, localDate, systemClock, type Clock } from '@adxlens/core/shared';
import { resolveActor } from '@adxlens/core/tenancy';
import { schema, type Db } from '@adxlens/db';
import type { Enqueue } from '@adxlens/jobs';
import { MOCK_ACCOUNTS, MOCK_DISCREPANCY, MockMetaRead } from '@adxlens/meta-client/mock';

export type DrillStep = { step: string; ok: boolean; detail: string };

/**
 * Diễn tập 3 sự cố (implementation-guide B9, L2 11.2) trên DB local với Meta GIẢ: tạo workspace riêng, giả lập
 * (1) Meta rate limit, (2) đối chiếu lệch, (3) thực thi lỗi; kiểm mỗi sự cố được mở và playbook chạy đúng.
 * Không bao giờ gọi Meta thật; CLI từ chối môi trường khác local.
 */
export async function runIncidentDrill(
  db: Db,
  deps: { keys: { keys: TokenKeys; current: number }; clock?: Clock },
): Promise<{ workspaceId: string; steps: DrillStep[] }> {
  const clock = deps.clock ?? systemClock;
  const now = clock.now;
  const steps: DrillStep[] = [];
  const queued: { name: string }[] = [];
  const enqueue: Enqueue = async (name) => void queued.push({ name });

  // Chuẩn bị: workspace + owner (staff PM để bật cờ) + kết nối Meta giả có quyền ghi + 2 tài khoản đồng bộ 7 ngày.
  const userId = randomUUID();
  await db.insert(schema.users).values({ id: userId, email: `drill-${userId.slice(0, 8)}@adxlens.local` });
  const [ws] = await db
    .insert(schema.workspaces)
    .values({ name: `Diễn tập sự cố ${now().toISOString().slice(0, 16)}` })
    .returning();
  await db.insert(schema.memberships).values({ workspaceId: ws!.id, userId, role: 'owner' });
  await db.insert(schema.staff).values({ userId, role: 'superadmin', canEnableFlags: true }).onConflictDoNothing();
  const ctx = { db, workspaceId: ws!.id, actor: (await resolveActor(db, ws!.id, userId))! };
  const meta = new MockMetaRead(now);
  const { connectionId } = await saveConnection(
    ctx,
    {
      token: 'mock-write-drill',
      expiresAt: null,
      scopes: ['ads_read', 'ads_management'],
      metaUser: { id: `drill-${userId}` },
      accounts: MOCK_ACCOUNTS,
    },
    deps.keys,
  );
  const imported = await importAccounts(ctx, {
    connectionId,
    metaAccountIds: ['act_100000001', MOCK_DISCREPANCY.account],
  });
  for (const a of imported) {
    const calls: { payload: unknown }[] = [];
    await startBackfill(ctx, a.adAccountId, { enqueue: async (_n, p) => void calls.push({ payload: p }), clock });
    await syncRange(ctx, calls[0]!.payload as never, { meta, keys: deps.keys.keys, clock });
  }
  const [okAcc, lagAcc] = imported;

  // 1. Meta rate limit: 30 lời gọi bị chặn trong 15 phút → health check → playbook hoãn queue sync.
  await db.insert(schema.jobAudit).values(
    Array.from({ length: 30 }, () => ({
      workspaceId: ws!.id,
      endpoint: 'act/insights',
      durationMs: 50,
      status: 400,
      errorCode: 17,
      at: now(),
    })),
  );
  const throttled: number[] = [];
  const results = await runHealthChecks(db);
  const remediated = await remediateHealth(
    db,
    results,
    { throttleQueue: async (_q, ms) => void throttled.push(ms) },
    clock,
  );
  const rlIncident = (await listIncidents(db, { status: ['open'] })).find((i) => i.kind === 'health:meta_rate_limit');
  steps.push({
    step: 'Meta rate limit',
    ok:
      Boolean(rlIncident) &&
      ['done', 'escalated'].includes(remediated.meta_rate_limited ?? '') &&
      (remediated.meta_rate_limited === 'escalated' || throttled.length === 1),
    detail: `sự cố ${rlIncident ? rlIncident.severity : 'không có'}; playbook meta_rate_limited: ${remediated.meta_rate_limited ?? 'không chạy'}`,
  });
  // Dọn tín hiệu giả để không ảnh hưởng health check thật.
  await db
    .delete(schema.jobAudit)
    .where(and(eq(schema.jobAudit.workspaceId, ws!.id), eq(schema.jobAudit.errorCode, 17)));

  // 2. Đối chiếu lệch: tài khoản mock có ngày lệch 1,4% → sự cố + playbook đồng bộ lại sau 24 giờ.
  const lagAccount = lagAcc!;
  const today = localDate(now(), 'Asia/Ho_Chi_Minh');
  const rec = await reconcileAccount(
    ctx,
    { adAccountId: lagAccount.adAccountId, from: addDays(today, -6), to: addDays(today, -1) },
    { meta, keys: deps.keys.keys, clock, enqueue },
  );
  const recIncident = (await listIncidents(db, { status: ['open'] })).find(
    (i) => i.kind === 'reconciliation_warning' && i.workspaceId === ws!.id,
  );
  steps.push({
    step: 'Đối chiếu lệch > 1%',
    ok: rec.status === 'warning' && Boolean(recIncident),
    detail: `kết quả ${rec.status}${'warningDates' in rec ? ` (${rec.warningDates.join(', ')})` : ''}; sự cố ${recIncident ? recIncident.severity : 'không có'}`,
  });

  // 3. Thực thi lỗi: bật cờ duyệt hành động, gói Growth, quyền ghi, breaker sau 1 lỗi → Meta lỗi → P1 + breaker mở.
  for (const key of ['p0_reports', 'p1_recommendations', 'p2a_approve'] as const) {
    await enableFlag(db, { workspaceId: ws!.id, key, staffUserId: userId, reason: 'Diễn tập sự cố', override: true });
  }
  await setSubscription(ctx, { planKey: 'growth' });
  await setWriteEnabled(ctx, connectionId, true);
  await saveGuardrails(ctx, { ...GUARDRAIL_DEFAULTS, excludeMetaIds: [], breakerFailures: 1 });
  const [ad] = await db
    .select({ metaId: schema.entities.metaId })
    .from(schema.entities)
    .where(
      and(
        eq(schema.entities.adAccountId, okAcc!.adAccountId),
        eq(schema.entities.entityType, 'ad'),
        eq(schema.entities.status, 'ACTIVE'),
      ),
    )
    .limit(1);
  const writer = newMockMetaWriter();
  writer.failNext('error_before');
  const action = await requestAction(
    ctx,
    { adAccountId: okAcc!.adAccountId, actionType: 'pause_ad', targetMetaId: ad!.metaId },
    { enqueue, clock },
  );
  const exec = await executeAction({ db, workspaceId: ws!.id }, action.id, {
    writer,
    keys: deps.keys.keys,
    clock,
    enqueue,
  });
  const exIncident = (await listIncidents(db, { status: ['open'] })).find(
    (i) => i.kind === 'execution_failed' && i.workspaceId === ws!.id,
  );
  const [breaker] = await db
    .select()
    .from(schema.circuitBreakers)
    .where(eq(schema.circuitBreakers.adAccountId, okAcc!.adAccountId));
  steps.push({
    step: 'Thực thi lỗi trên Meta',
    ok: exec.status === 'failed' && exIncident?.severity === 'P1' && Boolean(breaker?.open),
    detail: `hành động ${exec.status}/${exec.resultCode ?? ''}; sự cố ${exIncident?.severity ?? 'không có'}; breaker ${breaker?.open ? 'mở' : 'đóng'}`,
  });
  return { workspaceId: ws!.id, steps };
}

/** Dọn sau diễn tập: xóa workspace diễn tập (cascade), đóng sự cố liên quan, xóa người dùng diễn tập. */
export async function cleanupDrill(db: Db, workspaceId: string): Promise<void> {
  const members = await db
    .select({ userId: schema.memberships.userId })
    .from(schema.memberships)
    .where(eq(schema.memberships.workspaceId, workspaceId));
  const incidents = await db.select().from(schema.opsIncidents).where(eq(schema.opsIncidents.workspaceId, workspaceId));
  for (const i of incidents) await resolveIncidentsByFingerprint(db, i.fingerprint);
  await resolveIncidentsByFingerprint(db, 'health:meta_rate_limit');
  await db.delete(schema.workspaces).where(eq(schema.workspaces.id, workspaceId));
  const ids = members.map((m) => m.userId);
  if (ids.length) {
    await db.delete(schema.staff).where(inArray(schema.staff.userId, ids));
    await db.delete(schema.users).where(inArray(schema.users.id, ids));
  }
}
