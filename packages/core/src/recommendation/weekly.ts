import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import type { Enqueue } from '@adxlens/jobs';
import { listAdAccounts } from '@adxlens/core/connections';
import { notify } from '@adxlens/core/notification';
import { DIGEST_WEEKDAY, isDue, mondayOf } from '@adxlens/core/reporting';
import {
  addDays,
  AppError,
  compareDecimal,
  localDate,
  mulRatio,
  SYSTEM_ACTOR,
  systemClock,
  type ActorCtx,
  type Clock,
  type WorkspaceCtx,
} from '@adxlens/core/shared';
import { assertCan, canAccessClient } from '@adxlens/core/tenancy';
import { creativeLibrary } from './creatives';

const { recommendations, findings, memberships, workspaces, users } = schema;

/** Giờ tạo Weekly Action List: thứ Hai 07:00 theo múi giờ workspace (PRD 10.4), trước digest 08:00. */
export const WEEKLY_ACTIONS_HOUR = 7;

/**
 * Độ tin cậy và công sức (phút) theo loại gợi ý — minh bạch, ghi ở `docs/rules/weekly-actions.md`.
 * Độ tin cậy phản ánh mức chắc chắn của quy tắc; công sức là thời gian thao tác ước tính trên Ads Manager.
 */
export const ACTION_PROFILES: Record<string, { confidence: number; effortMinutes: number }> = {
  creative_fatigue: { confidence: 0.7, effortMinutes: 30 },
  budget_misallocation: { confidence: 0.6, effortMinutes: 15 },
  starved_winner: { confidence: 0.5, effortMinutes: 10 },
  fragmentation: { confidence: 0.5, effortMinutes: 45 },
  learning_limited: { confidence: 0.6, effortMinutes: 20 },
  spend_no_conversion: { confidence: 0.8, effortMinutes: 15 },
  account_hygiene: { confidence: 0.9, effortMinutes: 10 },
  conversion_tracking: { confidence: 0.8, effortMinutes: 30 },
  creative_loser: { confidence: 0.6, effortMinutes: 10 },
  creative_winner: { confidence: 0.5, effortMinutes: 15 },
};
const DEFAULT_PROFILE = { confidence: 0.5, effortMinutes: 20 };
/** Tác động tương đối khi quy tắc không ước tính được tiền. */
export const SEVERITY_RELATIVE_IMPACT = { high: 0.1, medium: 0.05, low: 0.02 } as const;
/** Loại gợi ý có ≥ 3 lần quyết định: điểm × (1 − tỷ lệ "sai"), tối thiểu 0,3. */
export const WRONG_PENALTY = { minDecided: 3, floor: 0.3, reviewMinDecided: 5, reviewRate: 0.15 } as const;

type Candidate = {
  adAccountId: string;
  source: 'finding' | 'creative';
  sourceKey: string;
  findingId: string | null;
  entityType: string;
  metaId: string;
  entityName: string | null;
  action: { key: string; params?: Record<string, string | number> };
  why: { key: string; params?: Record<string, string | number> };
  evidence: Record<string, unknown>;
  impactEstimate: string | null;
  severity: keyof typeof SEVERITY_RELATIVE_IMPACT;
};

/** Điểm ưu tiên (PRD 10.3) = tác động tương đối × độ tin cậy ÷ công sức (giờ) × hệ số "sai". */
export function priorityScore(input: {
  impactEstimate: string | null;
  accountSpend7d: string;
  severity: keyof typeof SEVERITY_RELATIVE_IMPACT;
  confidence: number;
  effortMinutes: number;
  wrongMultiplier: number;
}): number {
  const rel =
    input.impactEstimate !== null && compareDecimal(input.accountSpend7d, '0') > 0
      ? Math.min(1, Number(input.impactEstimate) / Number(input.accountSpend7d)) // tỷ lệ, không phải tiền
      : SEVERITY_RELATIVE_IMPACT[input.severity];
  return (rel * input.confidence * input.wrongMultiplier) / (input.effortMinutes / 60);
}

/** Hệ số giảm theo tỷ lệ "sai" của từng loại gợi ý trong 90 ngày (PRD 10.3). */
export async function wrongRates(ctx: WorkspaceCtx, now: Date) {
  const since = new Date(now.getTime() - 90 * 86_400_000);
  const rows = await ctx.db
    .select({
      sourceKey: recommendations.sourceKey,
      decided: sql<number>`count(*)::int`,
      wrong: sql<number>`(count(*) filter (where ${recommendations.skipReason} = 'wrong'))::int`,
    })
    .from(recommendations)
    .where(
      and(
        eq(recommendations.workspaceId, ctx.workspaceId),
        inArray(recommendations.status, ['done', 'skipped']),
        gte(recommendations.statusChangedAt, since),
      ),
    )
    .groupBy(recommendations.sourceKey);
  return new Map(
    rows.map((r) => {
      const rate = r.decided ? r.wrong / r.decided : 0;
      const multiplier = r.decided >= WRONG_PENALTY.minDecided ? Math.max(WRONG_PENALTY.floor, 1 - rate) : 1;
      return [r.sourceKey, { decided: r.decided, wrong: r.wrong, rate, multiplier }];
    }),
  );
}

/** Loại gợi ý cần rà soát quy tắc: ≥ 5 lần quyết định và tỷ lệ "sai" > 15% (chỉ số mục tiêu PRD 10.5). */
export async function reviewQueue(ctx: WorkspaceCtx, clock: Clock = systemClock) {
  const rates = await wrongRates(ctx, clock.now());
  return [...rates.entries()]
    .filter(([, r]) => r.decided >= WRONG_PENALTY.reviewMinDecided && r.rate > WRONG_PENALTY.reviewRate)
    .map(([sourceKey, r]) => ({ sourceKey, ...r }));
}

async function candidates(ctx: WorkspaceCtx, now: Date) {
  const sys = { ...ctx, actor: SYSTEM_ACTOR };
  const accounts = (await listAdAccounts(sys)).filter((a) => a.connectionStatus !== 'revoked');
  const out: Candidate[] = [];
  const spend7 = new Map<string, string>();
  for (const a of accounts) {
    const to = addDays(localDate(now, a.timezone), -1);
    const range = { from: addDays(to, -6), to };
    const [s] = await ctx.db.execute<{ spend: string | null }>(sql`
      select sum(spend)::text as spend from analytics.insights_daily
      where workspace_id = ${ctx.workspaceId} and ad_account_id = ${a.id} and date between ${range.from} and ${range.to}`);
    spend7.set(a.id, s?.spend ?? '0');

    const open = await ctx.db
      .select()
      .from(findings)
      .where(
        and(
          eq(findings.workspaceId, ctx.workspaceId),
          eq(findings.adAccountId, a.id),
          inArray(findings.status, ['new', 'seen']),
          gte(findings.lastSeenAt, new Date(now.getTime() - 8 * 86_400_000)),
        ),
      );
    for (const f of open) {
      out.push({
        adAccountId: a.id,
        source: 'finding',
        sourceKey: f.ruleId,
        findingId: f.id,
        entityType: f.entityType,
        metaId: f.metaId,
        entityName: f.entityName,
        action: f.explanation.whatToDo,
        why: f.explanation.why,
        evidence: { ...f.evidence, deep_link: f.explanation.deepLink },
        impactEstimate: f.impactEstimate,
        severity: f.severity,
      });
    }

    for (const c of await creativeLibrary(sys, a.id, range)) {
      if (c.class === 'loser') {
        const ratio = Number(c.reason.params.ratio ?? 0);
        out.push({
          adAccountId: a.id,
          source: 'creative',
          sourceKey: 'creative_loser',
          findingId: null,
          entityType: 'creative',
          metaId: c.creativeId,
          entityName: c.name,
          action: { key: 'weekly.actions.creative_loser', params: { ads: c.adCount } },
          why: { key: `creatives.reasons.${c.reason.key}`, params: c.reason.params },
          evidence: { metrics: c.metrics, window: range },
          // Chi tiêu vượt so với nếu đạt CPA trung vị; chưa có kết quả → toàn bộ chi tiêu.
          impactEstimate:
            c.reason.key === 'loserNoResult' || ratio <= 1 ? c.metrics.spend : mulRatio(c.metrics.spend, 1 - 1 / ratio),
          severity: 'medium',
        });
      } else if (c.class === 'winner') {
        out.push({
          adAccountId: a.id,
          source: 'creative',
          sourceKey: 'creative_winner',
          findingId: null,
          entityType: 'creative',
          metaId: c.creativeId,
          entityName: c.name,
          action: { key: 'weekly.actions.creative_winner' },
          why: { key: `creatives.reasons.${c.reason.key}`, params: c.reason.params },
          evidence: { metrics: c.metrics, window: range },
          impactEstimate: null,
          severity: 'medium',
        });
      }
    }
  }
  return { out, spend7, accounts };
}

/**
 * Tạo Weekly Action List cho tuần `week` (thứ Hai). Idempotent: chạy lại cập nhật số liệu, giữ trạng thái,
 * người được gán. Gửi thông báo "việc tuần này" cho từng thành viên theo phạm vi Client của họ (P1-09).
 */
export async function generateWeeklyActions(
  ctx: WorkspaceCtx,
  week: string,
  deps: { clock?: Clock; enqueue?: Enqueue } = {},
): Promise<{ created: number; total: number }> {
  if (mondayOf(week) !== week) throw new AppError('VALIDATION_FAILED', 'Tuần phải bắt đầu từ thứ Hai');
  const now = (deps.clock ?? systemClock).now();
  const { out, spend7, accounts } = await candidates(ctx, now);
  const rates = await wrongRates(ctx, now);
  let created = 0;
  for (const c of out) {
    const profile = ACTION_PROFILES[c.sourceKey] ?? DEFAULT_PROFILE;
    const score = priorityScore({
      impactEstimate: c.impactEstimate,
      accountSpend7d: spend7.get(c.adAccountId) ?? '0',
      severity: c.severity,
      confidence: profile.confidence,
      effortMinutes: profile.effortMinutes,
      wrongMultiplier: rates.get(c.sourceKey)?.multiplier ?? 1,
    });
    const values = {
      findingId: c.findingId,
      entityType: c.entityType,
      entityName: c.entityName,
      action: c.action,
      why: c.why,
      evidence: c.evidence,
      impactEstimate: c.impactEstimate,
      confidence: profile.confidence.toFixed(3),
      effortMinutes: profile.effortMinutes,
      score: score.toFixed(6),
      updatedAt: now,
    };
    const [row] = await ctx.db
      .insert(recommendations)
      .values({
        workspaceId: ctx.workspaceId,
        adAccountId: c.adAccountId,
        week,
        source: c.source,
        sourceKey: c.sourceKey,
        metaId: c.metaId,
        ...values,
      })
      .onConflictDoUpdate({
        target: [
          recommendations.workspaceId,
          recommendations.week,
          recommendations.adAccountId,
          recommendations.source,
          recommendations.sourceKey,
          recommendations.metaId,
        ],
        set: values,
      })
      .returning({ createdAt: recommendations.createdAt });
    if (row && row.createdAt.getTime() >= now.getTime() - 1000) created++;
  }

  // P1-09: mỗi thành viên nhận một thông báo/email với số việc trong phạm vi Client của họ.
  const members = await ctx.db
    .select({ userId: memberships.userId, role: memberships.role, clientAccess: memberships.clientAccess })
    .from(memberships)
    .where(eq(memberships.workspaceId, ctx.workspaceId));
  const clientOf = new Map(accounts.map((a) => [a.id, a.clientId]));
  for (const m of members) {
    const actor = { userId: m.userId, role: m.role, clientAccess: m.clientAccess, approveClientIds: [] };
    const count = out.filter((c) => {
      const clientId = clientOf.get(c.adAccountId);
      return m.role === 'owner' || (clientId ? canAccessClient(actor, clientId) : m.role === 'manager');
    }).length;
    if (!count) continue;
    await notify(
      ctx,
      {
        kind: 'weekly_actions',
        recipients: { userIds: [m.userId] },
        params: { count, week },
        link: '/weekly-actions',
        dedupeKey: `weekly_actions:${week}`,
      },
      { enqueue: deps.enqueue },
    );
  }
  return { created, total: out.length };
}

export function isWeeklyActionsDue(timezone: string, now: Date): boolean {
  return isDue(
    {
      cadence: 'weekly',
      weekday: DIGEST_WEEKDAY,
      monthDay: null,
      sendHour: WEEKLY_ACTIONS_HOUR,
      timezone,
      enabled: true,
    },
    now,
  );
}

export function weeklyActionsWeek(timezone: string, now: Date): string {
  return mondayOf(localDate(now, timezone));
}

export type WeeklyActionItem = Awaited<ReturnType<typeof listWeeklyActions>>['items'][number];

/** P101: danh sách tuần (mặc định tuần mới nhất có dữ liệu), xếp theo điểm; buyer chỉ thấy Client được gán. */
export async function listWeeklyActions(
  ctx: ActorCtx,
  opts: { week?: string; status?: (typeof schema.RECOMMENDATION_STATUSES)[number]; assignee?: string } = {},
) {
  const accounts = (await listAdAccounts(ctx)).filter((a) => a.connectionStatus !== 'revoked');
  const byId = new Map(accounts.map((a) => [a.id, a]));
  if (!accounts.length) return { week: opts.week ?? null, weeks: [] as string[], items: [] };
  const weeks = (
    await ctx.db
      .selectDistinct({ week: recommendations.week })
      .from(recommendations)
      .where(
        and(eq(recommendations.workspaceId, ctx.workspaceId), inArray(recommendations.adAccountId, [...byId.keys()])),
      )
      .orderBy(desc(recommendations.week))
      .limit(12)
  ).map((r) => r.week);
  const week = opts.week ?? weeks[0] ?? null;
  if (!week) return { week: null, weeks, items: [] };
  const conds = [
    eq(recommendations.workspaceId, ctx.workspaceId),
    eq(recommendations.week, week),
    inArray(recommendations.adAccountId, [...byId.keys()]),
  ];
  if (opts.status) conds.push(eq(recommendations.status, opts.status));
  if (opts.assignee) conds.push(eq(recommendations.assigneeId, opts.assignee));
  const rows = await ctx.db
    .select({ r: recommendations, assigneeName: users.fullName, assigneeEmail: users.email })
    .from(recommendations)
    .leftJoin(users, eq(users.id, recommendations.assigneeId))
    .where(and(...conds))
    .orderBy(desc(recommendations.score), recommendations.id);
  return {
    week,
    weeks,
    items: rows.map(({ r, assigneeName, assigneeEmail }) => {
      const a = byId.get(r.adAccountId)!;
      return {
        ...r,
        accountName: a.name,
        currency: a.currency,
        clientId: a.clientId,
        clientName: a.clientName,
        assigneeName: r.assigneeId ? (assigneeName ?? assigneeEmail) : null,
      };
    }),
  };
}

/** Người có thể nhận việc của tài khoản (P1-05): thành viên xem được Client của tài khoản. */
export async function assignableMembers(ctx: ActorCtx, adAccountId: string) {
  const account = (await listAdAccounts(ctx)).find((a) => a.id === adAccountId);
  if (!account) throw new AppError('NOT_FOUND', 'Không tìm thấy tài khoản');
  const rows = await ctx.db
    .select({
      userId: memberships.userId,
      role: memberships.role,
      clientAccess: memberships.clientAccess,
      name: users.fullName,
      email: users.email,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.workspaceId, ctx.workspaceId));
  return rows.filter((m) =>
    account.clientId
      ? canAccessClient(
          { userId: m.userId, role: m.role, clientAccess: m.clientAccess, approveClientIds: [] },
          account.clientId,
        )
      : m.role !== 'buyer',
  );
}

/**
 * P1-05: đổi trạng thái (Đề xuất / Đang làm / Đã làm / Bỏ qua kèm lý do) và người được gán. Bỏ qua vì
 * "sai" giảm xếp hạng loại gợi ý đó ở các tuần sau.
 */
export async function updateWeeklyAction(
  ctx: ActorCtx,
  id: string,
  input: {
    status?: (typeof schema.RECOMMENDATION_STATUSES)[number];
    skipReason?: (typeof schema.SKIP_REASONS)[number] | null;
    assigneeId?: string | null;
  },
  deps: { clock?: Clock } = {},
) {
  assertCan(ctx.actor, 'recommendations.update');
  const now = (deps.clock ?? systemClock).now();
  const [rec] = await ctx.db
    .select()
    .from(recommendations)
    .where(and(eq(recommendations.workspaceId, ctx.workspaceId), eq(recommendations.id, id)));
  const account = rec && (await listAdAccounts(ctx)).find((a) => a.id === rec.adAccountId);
  if (!rec || !account) throw new AppError('NOT_FOUND', 'Không tìm thấy gợi ý');
  const set: Partial<typeof recommendations.$inferInsert> = { updatedAt: now };
  if (input.status) {
    if (input.status === 'skipped' && !input.skipReason) throw new AppError('VALIDATION_FAILED', 'Cần lý do bỏ qua');
    set.status = input.status;
    set.skipReason = input.status === 'skipped' ? input.skipReason! : null;
    set.statusChangedBy = ctx.actor.userId;
    set.statusChangedAt = now;
    set.doneAt = input.status === 'done' ? now : null;
  }
  if (input.assigneeId !== undefined) {
    if (input.assigneeId !== null) {
      const ok = (await assignableMembers(ctx, rec.adAccountId)).some((m) => m.userId === input.assigneeId);
      if (!ok) throw new AppError('VALIDATION_FAILED', 'Thành viên không xem được Client của tài khoản này');
    }
    set.assigneeId = input.assigneeId;
  }
  const [row] = await ctx.db
    .update(recommendations)
    .set(set)
    .where(and(eq(recommendations.workspaceId, ctx.workspaceId), eq(recommendations.id, id)))
    .returning();
  if (input.assigneeId && input.assigneeId !== rec.assigneeId && input.assigneeId !== ctx.actor.userId) {
    await notify(ctx, {
      kind: 'action_assigned',
      recipients: { userIds: [input.assigneeId] },
      params: { account: account.name, item: rec.entityName ?? rec.metaId },
      link: `/weekly-actions?week=${rec.week}`,
      dedupeKey: `action_assigned:${rec.id}:${input.assigneeId}`,
    });
  }
  return row!;
}

/** Workspace có múi giờ (dùng bởi job tick). */
export async function workspaceTimezone(ctx: WorkspaceCtx): Promise<string> {
  const [w] = await ctx.db
    .select({ tz: workspaces.defaultTimezone })
    .from(workspaces)
    .where(eq(workspaces.id, ctx.workspaceId));
  return w?.tz ?? 'Asia/Ho_Chi_Minh';
}
