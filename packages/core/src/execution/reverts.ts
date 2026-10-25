import { and, eq, sql } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import type { Enqueue } from '@adxlens/jobs';
import { isEnabled } from '@adxlens/core/flags';
import { notify } from '@adxlens/core/notification';
import { addDays, localDate, systemClock, type Clock, type WorkspaceCtx } from '@adxlens/core/shared';
import { minorUnits, requestAutoAction } from './gateway';
import type { ActionType } from './guardrails';

const { scheduledReverts, actions, automationRules, adAccounts, entities } = schema;

/** Giờ địa phương (0–23) và ngày theo múi giờ tài khoản. */
function localParts(now: Date, timeZone: string): { date: string; hour: number; minute: number } {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const [h, m] = f.format(now).split(':').map(Number);
  return { date: localDate(now, timeZone), hour: h!, minute: m! };
}

/**
 * Lần tới của `hour:00` theo giờ tài khoản, sau `now` (ADR-0021). Đổi về UTC bằng độ lệch múi giờ tại thời điểm đó
 * (đủ cho múi giờ không đổi giờ mùa hè trong vài giờ tới; lệch tối đa 1 giờ với DST — job 15 phút xử lý muộn hơn).
 */
export function nextLocalHour(now: Date, timeZone: string, hour: number): Date {
  const p = localParts(now, timeZone);
  const offsetMs =
    Date.UTC(
      Number(p.date.slice(0, 4)),
      Number(p.date.slice(5, 7)) - 1,
      Number(p.date.slice(8, 10)),
      p.hour,
      p.minute,
    ) -
    Math.floor(now.getTime() / 60_000) * 60_000;
  const day = p.hour < hour ? p.date : addDays(p.date, 1);
  const localMs = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), hour, 0);
  return new Date(localMs - offsetMs);
}

/** Ghi lịch hẹn cho hành động rule vừa tạo (Surf: trả ngân sách; Stop-loss: đề xuất bật lại). Một lịch / hành động. */
export async function scheduleRevert(
  ctx: WorkspaceCtx,
  input: { ruleId: string; actionId: string; kind: 'restore_budget' | 'suggest_undo'; dueAt: Date },
): Promise<boolean> {
  const rows = await ctx.db
    .insert(scheduledReverts)
    .values({ workspaceId: ctx.workspaceId, ...input })
    .onConflictDoNothing()
    .returning({ id: scheduledReverts.id });
  return rows.length > 0;
}

type Outcome = { status: 'done' | 'skipped' | 'waiting'; result: string; resultActionId?: string };

/**
 * Job `execute:revert` (ADR-0021). `restore_budget`: tạo hành động auto trả ngân sách cũ qua Execution Gateway (đủ
 * guardrails); trạng thái hiện tại đã khác kết quả rule (người dùng sửa tay) → bỏ qua. `suggest_undo`: thông báo
 * Owner / Manager kèm link Hoàn tác — không ghi Meta. Bị chặn tạm thời (giờ yên tĩnh, hạn mức ngày) → chờ lần sau.
 */
export async function runScheduledRevert(
  ctx: WorkspaceCtx,
  revertId: string,
  deps: { enqueue: Enqueue; clock?: Clock },
): Promise<Outcome> {
  const clock = deps.clock ?? systemClock;
  const now = clock.now();
  const [r] = await ctx.db
    .select()
    .from(scheduledReverts)
    .where(and(eq(scheduledReverts.workspaceId, ctx.workspaceId), eq(scheduledReverts.id, revertId)));
  if (!r || r.status !== 'pending') return { status: 'skipped', result: 'not_pending' };
  if (r.dueAt > now) return { status: 'waiting', result: 'not_due' };
  const finish = async (o: Outcome) => {
    if (o.status === 'waiting') return o;
    await ctx.db
      .update(scheduledReverts)
      .set({ status: o.status, result: o.result, resultActionId: o.resultActionId ?? null, updatedAt: now })
      .where(and(eq(scheduledReverts.workspaceId, ctx.workspaceId), eq(scheduledReverts.id, r.id)));
    return o;
  };
  if (!(await isEnabled(ctx, 'p2b_auto'))) return finish({ status: 'skipped', result: 'feature_disabled' });
  const [a] = await ctx.db
    .select()
    .from(actions)
    .where(and(eq(actions.workspaceId, ctx.workspaceId), eq(actions.id, r.actionId)));
  if (!a || a.status !== 'success') return finish({ status: 'skipped', result: 'original_not_success' });
  const [rule] = r.ruleId
    ? await ctx.db
        .select({ name: automationRules.name, mode: automationRules.mode })
        .from(automationRules)
        .where(and(eq(automationRules.workspaceId, ctx.workspaceId), eq(automationRules.id, r.ruleId)))
    : [];

  if (r.kind === 'suggest_undo') {
    await notify(
      ctx,
      {
        kind: 'rule_suggest_resume',
        recipients: { roles: ['owner', 'manager'] },
        params: { rule: rule?.name ?? '—', item: a.targetName ?? a.targetMetaId },
        link: `/action-log/${a.id}`,
        dedupeKey: `rule_suggest_resume:${a.id}`,
      },
      { enqueue: deps.enqueue },
    );
    return finish({ status: 'done', result: 'notified' });
  }

  // restore_budget: rule đã tắt / xóa → vẫn trả ngân sách (đưa về trạng thái trước rule là hướng an toàn).
  const [acc] = await ctx.db
    .select({ id: adAccounts.id })
    .from(adAccounts)
    .where(and(eq(adAccounts.workspaceId, ctx.workspaceId), eq(adAccounts.id, a.adAccountId)));
  if (!acc) return finish({ status: 'skipped', result: 'account_missing' });
  const [e] = await ctx.db
    .select({ dailyBudget: sql<string | null>`${entities.dailyBudget}::text` })
    .from(entities)
    .where(
      and(
        eq(entities.workspaceId, ctx.workspaceId),
        eq(entities.adAccountId, a.adAccountId),
        eq(entities.entityType, 'adset'),
        eq(entities.metaId, a.targetMetaId),
      ),
    );
  const expected = a.afterExpected.daily_budget ?? null;
  if (e?.dailyBudget != null && expected !== null && minorUnits(e.dailyBudget) !== expected) {
    return finish({ status: 'skipped', result: 'manual_change' });
  }
  const res = await requestAutoAction(
    ctx,
    {
      ruleId: r.ruleId ?? a.ruleId ?? r.id,
      adAccountId: a.adAccountId,
      actionType: a.actionType as ActionType,
      targetMetaId: a.targetMetaId,
      newDailyBudget: a.beforeState.daily_budget ?? null,
      revertOf: { actionId: a.id, expectedState: { daily_budget: expected } },
    },
    { enqueue: deps.enqueue, clock },
  );
  if ('action' in res) return finish({ status: 'done', result: 'restored', resultActionId: res.action.id });
  // Tạm thời (giờ yên tĩnh, hạn mức hôm nay, kill switch, breaker) → thử lại lần sau; vĩnh viễn → bỏ qua.
  const transient = /quiet_hours|too_many_actions|kill_switch|circuit_breaker_open|no_write_access/.test(res.skipped);
  if (transient && now.getTime() - r.dueAt.getTime() < 24 * 3_600_000)
    return { status: 'waiting', result: res.skipped };
  return finish({ status: 'skipped', result: res.skipped });
}
