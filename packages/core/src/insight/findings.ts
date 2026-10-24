import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import { AppError, notFound, type ActorCtx } from '@adxlens/core/shared';
import { canAccessClient } from '@adxlens/core/tenancy';
import type { Severity } from './types';

const { adAccounts, findings, findingFeedback } = schema;

const SEVERITY_RANK = sql`case ${findings.severity} when 'high' then 3 when 'medium' then 2 else 1 end`;

/** Buyer chỉ thấy tài khoản của Client được gán (CLAUDE.md, PRD vai trò). */
async function assertAccountAccess(ctx: ActorCtx, adAccountId: string) {
  const [a] = await ctx.db
    .select({ id: adAccounts.id, clientId: adAccounts.clientId })
    .from(adAccounts)
    .where(and(eq(adAccounts.workspaceId, ctx.workspaceId), eq(adAccounts.id, adAccountId)));
  if (!a) throw notFound('Tài khoản QC');
  const full = ctx.actor.role === 'owner' || (ctx.actor.role === 'manager' && ctx.actor.clientAccess.length === 0);
  if (!full && !(a.clientId && canAccessClient(ctx.actor, a.clientId))) throw notFound('Tài khoản QC');
}

export type FindingFilter = {
  severity?: Severity;
  group?: string;
  status?: 'new' | 'seen' | 'done' | 'dismissed' | 'resolved';
  /** Mặc định chỉ phát hiện đang mở (new, seen). */
  includeClosed?: boolean;
  cursor?: string | null;
  limit?: number;
};

/** D02: phát hiện của một tài khoản, mức độ cao trước, rồi tác động lớn trước; phân trang theo id. */
export async function listFindings(ctx: ActorCtx, adAccountId: string, f: FindingFilter = {}) {
  await assertAccountAccess(ctx, adAccountId);
  const limit = Math.min(Math.max(f.limit ?? 50, 1), 200);
  const offset = f.cursor ? Number.parseInt(Buffer.from(f.cursor, 'base64url').toString(), 10) || 0 : 0;
  const rows = await ctx.db
    .select()
    .from(findings)
    .where(
      and(
        eq(findings.workspaceId, ctx.workspaceId),
        eq(findings.adAccountId, adAccountId),
        f.severity ? eq(findings.severity, f.severity) : undefined,
        f.group ? eq(findings.ruleGroup, f.group) : undefined,
        f.status
          ? eq(findings.status, f.status)
          : f.includeClosed
            ? undefined
            : inArray(findings.status, ['new', 'seen']),
      ),
    )
    .orderBy(
      desc(SEVERITY_RANK),
      sql`${findings.impactEstimate} desc nulls last`,
      desc(findings.lastSeenAt),
      findings.id,
    )
    .limit(limit + 1)
    .offset(offset);
  const more = rows.length > limit;
  return {
    items: rows.slice(0, limit),
    nextCursor: more ? Buffer.from(String(offset + limit)).toString('base64url') : null,
  };
}

export async function getFinding(ctx: ActorCtx, findingId: string) {
  const [f] = await ctx.db
    .select()
    .from(findings)
    .where(and(eq(findings.workspaceId, ctx.workspaceId), eq(findings.id, findingId)));
  if (!f) throw notFound('Phát hiện');
  await assertAccountAccess(ctx, f.adAccountId);
  return f;
}

/**
 * Phản hồi (L3 10.2 `/findings/{id}/feedback`): seen/done/dismissed đổi trạng thái; `wrong` ghi nhận để
 * tổng hợp tỷ lệ sai theo quy tắc và bỏ qua phát hiện (lý do "wrong"). Bỏ qua cần lý do.
 */
export async function recordFeedback(
  ctx: ActorCtx,
  findingId: string,
  input: { kind: 'seen' | 'done' | 'dismissed' | 'wrong'; note?: string | null },
): Promise<void> {
  const f = await getFinding(ctx, findingId);
  const note = input.note?.trim() || null;
  if (input.kind === 'dismissed' && !note) throw new AppError('VALIDATION_FAILED', 'Cần lý do bỏ qua');
  await ctx.db.insert(findingFeedback).values({
    workspaceId: ctx.workspaceId,
    findingId: f.id,
    userId: ctx.actor.userId,
    kind: input.kind,
    note,
  });
  const next =
    input.kind === 'seen' ? (f.status === 'new' ? 'seen' : f.status) : input.kind === 'done' ? 'done' : 'dismissed';
  await ctx.db
    .update(findings)
    .set({
      status: next,
      dismissReason: input.kind === 'wrong' ? 'wrong' : input.kind === 'dismissed' ? note : f.dismissReason,
    })
    .where(and(eq(findings.workspaceId, ctx.workspaceId), eq(findings.id, f.id)));
}

/** Tỷ lệ phản hồi "sai" theo quy tắc trong workspace (L2 5.4), để rà soát quy tắc. */
export async function wrongRateByRule(ctx: ActorCtx) {
  const rows = await ctx.db
    .select({
      ruleId: findings.ruleId,
      total: sql<number>`count(distinct ${findings.id})::int`,
      wrong: sql<number>`(count(distinct ${findings.id}) filter (where ${findingFeedback.kind} = 'wrong'))::int`,
    })
    .from(findings)
    .leftJoin(findingFeedback, eq(findingFeedback.findingId, findings.id))
    .where(eq(findings.workspaceId, ctx.workspaceId))
    .groupBy(findings.ruleId);
  return rows.map((r) => ({ ...r, rate: r.total ? r.wrong / r.total : 0 }));
}
