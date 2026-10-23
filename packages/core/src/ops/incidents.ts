import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import type { DbOrTx } from '@adxlens/db';
import { schema } from '@adxlens/db';
import { systemClock, type Clock } from '@adxlens/core/shared';

const { opsIncidents, opsPlaybookRuns } = schema;

export type Severity = (typeof schema.INCIDENT_SEVERITIES)[number];

export type IncidentInput = {
  kind: string;
  severity: Severity;
  source: string;
  title: string;
  fingerprint: string;
  workspaceId?: string | null;
  adAccountId?: string | null;
  /** Chỉ dữ liệu đã che: không token, không body request. */
  detail?: Record<string, unknown>;
};

/**
 * Mở sự cố, hoặc tăng số lần nếu cùng fingerprint đang mở. Hàm trong module ops được phép đọc
 * xuyên workspace: sự cố là dữ liệu vận hành nội bộ (CLAUDE.md quy tắc 1, ngoại lệ có ghi chú).
 */
export async function openIncident(db: DbOrTx, input: IncidentInput) {
  const [existing] = await db
    .select({ id: opsIncidents.id })
    .from(opsIncidents)
    .where(and(eq(opsIncidents.fingerprint, input.fingerprint), inArray(opsIncidents.status, ['open', 'mitigated'])))
    .limit(1);
  if (existing) {
    const [row] = await db
      .update(opsIncidents)
      .set({ occurrences: sql`${opsIncidents.occurrences} + 1` })
      .where(eq(opsIncidents.id, existing.id))
      .returning();
    return { incident: row!, created: false };
  }
  const [row] = await db
    .insert(opsIncidents)
    .values({
      kind: input.kind,
      severity: input.severity,
      source: input.source,
      title: input.title,
      fingerprint: input.fingerprint,
      workspaceId: input.workspaceId ?? null,
      adAccountId: input.adAccountId ?? null,
      detail: input.detail ?? {},
    })
    .returning();
  return { incident: row!, created: true };
}

export async function setIncidentStatus(
  db: DbOrTx,
  id: string,
  status: 'mitigated' | 'resolved',
  clock: Clock = systemClock,
): Promise<void> {
  await db
    .update(opsIncidents)
    .set({ status, resolvedAt: status === 'resolved' ? clock.now() : null })
    .where(eq(opsIncidents.id, id));
}

/** Danh sách sự cố cho trang admin (staff). Truy vấn xuyên workspace có chủ đích. */
export async function listIncidents(
  db: DbOrTx,
  opts: { status?: (typeof schema.INCIDENT_STATUSES)[number][]; limit?: number } = {},
) {
  const q = db.select().from(opsIncidents);
  const filtered = opts.status?.length ? q.where(inArray(opsIncidents.status, opts.status)) : q;
  return filtered.orderBy(desc(opsIncidents.createdAt)).limit(opts.limit ?? 100);
}

export async function openP1Count(db: DbOrTx, workspaceId: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(opsIncidents)
    .where(
      and(
        eq(opsIncidents.workspaceId, workspaceId),
        eq(opsIncidents.severity, 'P1'),
        inArray(opsIncidents.status, ['open', 'mitigated']),
      ),
    );
  return r?.n ?? 0;
}

// ---------- Playbook ----------

export type PlaybookLimit = { max: number; windowMs: number };

/** Giới hạn số lần chạy (L2 11.2). */
export const PLAYBOOK_LIMITS: Record<string, PlaybookLimit> = {
  meta_rate_limited: { max: 3, windowMs: 3_600_000 },
  reconcile_retry: { max: 1, windowMs: 86_400_000 },
  token_expiring: { max: 1, windowMs: 86_400_000 },
  worker_stuck: { max: 3, windowMs: 3_600_000 },
  deploy_smoke_failed: { max: 1, windowMs: 86_400_000 },
  execution_failed: { max: Number.MAX_SAFE_INTEGER, windowMs: 3_600_000 },
};

export async function canRunPlaybook(
  db: DbOrTx,
  playbook: string,
  scopeKey: string,
  clock: Clock = systemClock,
): Promise<boolean> {
  const limit = PLAYBOOK_LIMITS[playbook];
  if (!limit) return false;
  const since = new Date(clock.now().getTime() - limit.windowMs);
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(opsPlaybookRuns)
    .where(
      and(
        eq(opsPlaybookRuns.playbook, playbook),
        eq(opsPlaybookRuns.scopeKey, scopeKey),
        inArray(opsPlaybookRuns.result, ['done', 'failed']),
        gte(opsPlaybookRuns.at, since),
      ),
    );
  return (r?.n ?? 0) < limit.max;
}

export async function recordPlaybookRun(
  db: DbOrTx,
  input: {
    playbook: string;
    scopeKey: string;
    result: 'done' | 'skipped' | 'failed' | 'escalated';
    incidentId?: string | null;
    workspaceId?: string | null;
    detail?: Record<string, unknown>;
  },
  clock: Clock = systemClock,
): Promise<void> {
  await db.insert(opsPlaybookRuns).values({
    playbook: input.playbook,
    scopeKey: input.scopeKey,
    result: input.result,
    incidentId: input.incidentId ?? null,
    workspaceId: input.workspaceId ?? null,
    detail: input.detail ?? {},
    at: clock.now(),
  });
}

/**
 * Chạy playbook có giới hạn: vượt giới hạn thì không chạy và trả 'escalated' để leo thang
 * (báo PM). Playbook không bao giờ nới ngưỡng, xóa dữ liệu hay bật cờ (L2 11.3).
 */
export async function runPlaybook(
  db: DbOrTx,
  input: {
    playbook: string;
    scopeKey: string;
    incidentId?: string | null;
    workspaceId?: string | null;
  },
  action: () => Promise<Record<string, unknown> | void>,
  clock: Clock = systemClock,
): Promise<'done' | 'failed' | 'escalated'> {
  if (!(await canRunPlaybook(db, input.playbook, input.scopeKey, clock))) {
    await recordPlaybookRun(db, { ...input, result: 'escalated' }, clock);
    return 'escalated';
  }
  try {
    const detail = (await action()) ?? {};
    await recordPlaybookRun(db, { ...input, result: 'done', detail }, clock);
    return 'done';
  } catch (e) {
    await recordPlaybookRun(
      db,
      { ...input, result: 'failed', detail: { error: e instanceof Error ? e.name : 'unknown' } },
      clock,
    );
    return 'failed';
  }
}

/** Đóng mọi sự cố đang mở cùng fingerprint (ví dụ đối chiếu đã khớp lại). */
export async function resolveIncidentsByFingerprint(
  db: DbOrTx,
  fingerprint: string,
  clock: Clock = systemClock,
): Promise<number> {
  const rows = await db
    .update(opsIncidents)
    .set({ status: 'resolved', resolvedAt: clock.now() })
    .where(and(eq(opsIncidents.fingerprint, fingerprint), inArray(opsIncidents.status, ['open', 'mitigated'])))
    .returning({ id: opsIncidents.id });
  return rows.length;
}
