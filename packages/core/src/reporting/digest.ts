import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import { listAdAccounts } from '@adxlens/core/connections';
import { healthScores } from '@adxlens/core/insight';
import {
  digestEmail,
  effectiveSettings,
  notify,
  type DigestAccountRow,
  type EmailSender,
} from '@adxlens/core/notification';
import {
  addDays,
  localDate,
  SYSTEM_ACTOR,
  systemClock,
  type Actor,
  type Clock,
  type WorkspaceCtx,
} from '@adxlens/core/shared';
import { resolveActor } from '@adxlens/core/tenancy';
import { isDue } from './schedule';

const { findings, healthSnapshots, memberships, reconciliationResults, reportSchedules, users, workspaces } = schema;

/** Digest gửi thứ Hai 08:00 theo múi giờ workspace (PRD P0-19). */
export const DIGEST_WEEKDAY = 1;
export const DIGEST_HOUR = 8;

/** Thứ Hai của tuần chứa `date` (YYYY-MM-DD). */
export function mondayOf(date: string): string {
  const wd = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(date, -wd);
}

export function isDigestDue(timezone: string, now: Date): boolean {
  return isDue(
    { cadence: 'weekly', weekday: DIGEST_WEEKDAY, monthDay: null, sendHour: DIGEST_HOUR, timezone, enabled: true },
    now,
  );
}

/** Dữ liệu digest cho một người xem (đúng phạm vi Client của họ). */
export async function digestFor(ctx: WorkspaceCtx & { actor: Actor }, week: string, clock: Clock = systemClock) {
  const accounts = (await listAdAccounts(ctx)).filter((a) => a.connectionStatus !== 'revoked');
  const ids = accounts.map((a) => a.id);
  const since = new Date(clock.now().getTime() - 7 * 86_400_000);
  const prevWeek = addDays(week, -7);
  const [health, newFindings, mismatch, prevSnaps] = await Promise.all([
    healthScores(ctx, ids),
    ids.length
      ? ctx.db
          .select({
            id: findings.adAccountId,
            n: sql<number>`count(*)::int`,
            high: sql<number>`(count(*) filter (where ${findings.severity} = 'high'))::int`,
          })
          .from(findings)
          .where(
            and(
              eq(findings.workspaceId, ctx.workspaceId),
              inArray(findings.adAccountId, ids),
              gte(findings.firstSeenAt, since),
              inArray(findings.status, ['new', 'seen']),
            ),
          )
          .groupBy(findings.adAccountId)
      : Promise.resolve([]),
    ids.length
      ? ctx.db
          .select({ id: reconciliationResults.adAccountId, n: sql<number>`count(*)::int` })
          .from(reconciliationResults)
          .where(
            and(
              eq(reconciliationResults.workspaceId, ctx.workspaceId),
              inArray(reconciliationResults.adAccountId, ids),
              eq(reconciliationResults.status, 'warning'),
              gte(reconciliationResults.date, addDays(week, -7)),
            ),
          )
          .groupBy(reconciliationResults.adAccountId)
      : Promise.resolve([]),
    ids.length
      ? ctx.db
          .select()
          .from(healthSnapshots)
          .where(
            and(
              eq(healthSnapshots.workspaceId, ctx.workspaceId),
              inArray(healthSnapshots.adAccountId, ids),
              eq(healthSnapshots.week, prevWeek),
            ),
          )
      : Promise.resolve([]),
  ]);
  const rows: DigestAccountRow[] = accounts.map((a) => {
    const score = health.get(a.id)?.score ?? 100;
    const prev = prevSnaps.find((s) => s.adAccountId === a.id);
    const f = newFindings.find((x) => x.id === a.id);
    return {
      name: a.name,
      clientName: a.clientName,
      health: score,
      healthChange: prev ? score - prev.score : null,
      newIssues: f?.n ?? 0,
      newHigh: f?.high ?? 0,
      mismatchDays: mismatch.find((m) => m.id === a.id)?.n ?? 0,
    };
  });
  rows.sort((x, y) => x.health - y.health);
  return rows;
}

async function schedulesThisWeek(ctx: WorkspaceCtx & { actor: Actor }) {
  const rows = await ctx.db
    .select({
      clientId: reportSchedules.clientId,
      cadence: reportSchedules.cadence,
      monthDay: reportSchedules.monthDay,
    })
    .from(reportSchedules)
    .where(and(eq(reportSchedules.workspaceId, ctx.workspaceId), eq(reportSchedules.enabled, true)));
  const full = ctx.actor.role === 'owner' || ctx.actor.clientAccess.length === 0;
  return rows
    .filter((r) => full || ctx.actor.clientAccess.includes(r.clientId))
    .filter((r) => r.cadence === 'weekly' || (r.monthDay ?? 0) <= 7).length;
}

/**
 * Job `notify:digest`: chụp health tuần này (để tuần sau so sánh), gửi digest cho từng owner/manager theo
 * phạm vi Client của họ và theo cài đặt "Tổng kết tuần". Một lần mỗi tuần (khóa chống trùng).
 */
export async function sendWeeklyDigest(
  ctx: WorkspaceCtx,
  week: string,
  deps: { email: EmailSender; appUrl: string; clock?: Clock },
): Promise<{ sent: number }> {
  const clock = deps.clock ?? systemClock;
  // Chụp health của mọi tài khoản cho tuần này (actor hệ thống chỉ đọc).
  const accounts = (await listAdAccounts({ ...ctx, actor: SYSTEM_ACTOR })).map((a) => a.id);
  for (const [id, h] of await healthScores(ctx, accounts)) {
    await ctx.db
      .insert(healthSnapshots)
      .values({ workspaceId: ctx.workspaceId, adAccountId: id, week, score: h.score })
      .onConflictDoUpdate({ target: [healthSnapshots.adAccountId, healthSnapshots.week], set: { score: h.score } });
  }
  const members = await ctx.db
    .select({ userId: memberships.userId, role: memberships.role, email: users.email, locale: users.locale })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.workspaceId, ctx.workspaceId), inArray(memberships.role, ['owner', 'manager'])));
  const settings = await effectiveSettings(
    ctx,
    members.map((m) => m.userId),
    'weekly_digest',
  );
  const [ws] = await ctx.db
    .select({ name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.id, ctx.workspaceId));
  let sent = 0;
  for (const m of members) {
    const s = settings.get(m.userId)!;
    const actor = await resolveActor(ctx.db, ctx.workspaceId, m.userId);
    if (!actor) continue;
    const actx = { ...ctx, actor };
    const rows = await digestFor(actx, week, clock);
    const locale = m.locale === 'en' ? 'en' : 'vi';
    const weekLabel = `${week.slice(8, 10)}/${week.slice(5, 7)}/${week.slice(0, 4)}`;
    // Chống trùng: chỉ gửi nếu tạo được thông báo tuần này (dòng ẩn khi không bật trong app).
    const created = await notify(ctx, {
      kind: 'weekly_digest',
      recipients: { userIds: [m.userId] },
      params: { week: weekLabel, summary: `${rows.reduce((t, r) => t + r.newIssues, 0)}` },
      link: '/overview',
      dedupeKey: `digest:${week}`,
      email: false,
      forceRecord: true,
    });
    if (!created.created || !s.email) continue;
    await deps.email.send(
      digestEmail({
        locale,
        to: m.email,
        workspaceName: ws?.name ?? '',
        weekLabel,
        accounts: rows,
        schedulesThisWeek: await schedulesThisWeek(actx),
        link: `${deps.appUrl}/overview`,
      }),
    );
    sent++;
  }
  return { sent };
}

/** Tuần của digest theo múi giờ workspace (thứ Hai hiện tại). */
export function digestWeek(timezone: string, now: Date): string {
  return mondayOf(localDate(now, timezone));
}
