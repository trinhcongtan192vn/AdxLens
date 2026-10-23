import { and, count, eq, gte, inArray, sql } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import type { Enqueue } from '@adxlens/jobs';
import { hasPlanEntitlement } from '@adxlens/core/billing';
import { connectionCanWrite, listAdAccounts, withConnectionToken, type TokenKeys } from '@adxlens/core/connections';
import { isEnabled } from '@adxlens/core/flags';
import { MetaApiError } from '@adxlens/meta-client';
import type { MetaWriteApi, WritableObject } from '@adxlens/meta-client/write';
import { notify } from '@adxlens/core/notification';
import { openIncident } from '@adxlens/core/ops';
import {
  addDays,
  AppError,
  localDate,
  systemClock,
  type ActorCtx,
  type Clock,
  type WorkspaceCtx,
} from '@adxlens/core/shared';
import { canApproveActions } from '@adxlens/core/tenancy';
import { checkGuardrails, effectiveGuardrails, type ActionType, type GuardrailViolation } from './guardrails';
import { breakerOpen, cancelPending, killSwitchState, recordFailure, recordSuccess } from './safety';

const { actions, actionLogs, adAccounts, entities } = schema;

type State = Record<string, string | null>;
export type ActionRow = typeof actions.$inferSelect;

const TARGET_TYPE: Record<ActionType, 'ad' | 'adset'> = {
  pause_ad: 'ad',
  resume_ad: 'ad',
  pause_adset: 'adset',
  resume_adset: 'adset',
  set_adset_budget: 'adset',
  duplicate_adset: 'adset',
};

/** Hoàn tác được hay không (ADR-0009..0011). */
export const UNDOABLE: Record<ActionType, boolean> = {
  pause_ad: true,
  resume_ad: true,
  pause_adset: true,
  resume_adset: true,
  set_adset_budget: true,
  duplicate_adset: false,
};

/** Đơn vị nhỏ nhất của tiền tệ dạng số nguyên (ngân sách Meta) từ chuỗi numeric. */
export function minorUnits(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const m = /^(\d+)(?:\.(\d+))?$/.exec(v.trim());
  if (!m) return null;
  return String(BigInt(m[1]!)); // phần lẻ của đơn vị nhỏ nhất bị bỏ (làm tròn xuống)
}

function expectedAfter(type: ActionType, newBudget?: string | null): State {
  if (type === 'pause_ad' || type === 'pause_adset') return { status: 'PAUSED' };
  if (type === 'resume_ad' || type === 'resume_adset') return { status: 'ACTIVE' };
  if (type === 'set_adset_budget') return { daily_budget: newBudget ?? null };
  return { copy_status: 'PAUSED' };
}

async function log(ctx: WorkspaceCtx, actionId: string, event: string, detail: Record<string, unknown> = {}) {
  await ctx.db.insert(actionLogs).values({ workspaceId: ctx.workspaceId, actionId, event, detail });
}

/** Số hành động trong ngày (theo múi giờ tài khoản) không tính bị hủy / thất bại. */
async function actionsToday(ctx: WorkspaceCtx, adAccountId: string, timezone: string, now: Date, exclude?: string) {
  const day = localDate(now, timezone);
  const rows = await ctx.db
    .select({ id: actions.id, createdAt: actions.createdAt })
    .from(actions)
    .where(
      and(
        eq(actions.workspaceId, ctx.workspaceId),
        eq(actions.adAccountId, adAccountId),
        inArray(actions.status, ['pending', 'executing', 'success', 'undone']),
        gte(actions.createdAt, new Date(now.getTime() - 2 * 86_400_000)),
      ),
    );
  return rows.filter((r) => r.id !== exclude && localDate(r.createdAt, timezone) === day).length;
}

/** Số ngày có hiển thị của đối tượng trong 30 ngày (ngưỡng dữ liệu tối thiểu). */
async function dataDays(ctx: WorkspaceCtx, adAccountId: string, type: 'ad' | 'adset', metaId: string, today: string) {
  const col = type === 'ad' ? sql`meta_id` : sql`adset_id`;
  const [r] = await ctx.db.execute<{ n: string }>(sql`
    select count(distinct date)::text as n from analytics.insights_daily
    where workspace_id = ${ctx.workspaceId} and ad_account_id = ${adAccountId} and ${col} = ${metaId}
      and impressions > 0 and date between ${addDays(today, -30)} and ${addDays(today, -1)}`);
  return Number(r?.n ?? 0);
}

async function targetEntity(ctx: WorkspaceCtx, adAccountId: string, type: 'ad' | 'adset', metaId: string) {
  const [e] = await ctx.db.execute<{
    name: string | null;
    status: string | null;
    daily_budget: string | null;
    parent: string | null;
    campaign: string | null;
  }>(sql`
    select e.name, e.status, e.daily_budget::text as daily_budget, e.parent_meta_id as parent,
      coalesce(e.attrs->>'campaign_id', p.parent_meta_id) as campaign
    from analytics.entities e
    left join analytics.entities p on p.workspace_id = e.workspace_id and p.ad_account_id = e.ad_account_id
      and p.entity_type = 'adset' and p.meta_id = e.parent_meta_id
    where e.workspace_id = ${ctx.workspaceId} and e.ad_account_id = ${adAccountId}
      and e.entity_type = ${type} and e.meta_id = ${metaId}`);
  return e ?? null;
}

async function accountOf(ctx: WorkspaceCtx, adAccountId: string) {
  const [a] = await ctx.db
    .select({
      id: adAccounts.id,
      clientId: adAccounts.clientId,
      timezone: adAccounts.timezone,
      connectionId: adAccounts.connectionId,
      name: adAccounts.name,
    })
    .from(adAccounts)
    .where(and(eq(adAccounts.workspaceId, ctx.workspaceId), eq(adAccounts.id, adAccountId)));
  return a ?? null;
}

/** Cổng an toàn chung (ADR-0008 bước 1–3). Trả lý do chặn hoặc null. */
async function safetyBlock(ctx: WorkspaceCtx, adAccountId: string, connectionId: string): Promise<string | null> {
  if (!(await isEnabled(ctx, 'p2a_approve'))) return 'feature_disabled';
  if (!(await hasPlanEntitlement(ctx, 'write_actions'))) return 'plan_required';
  const k = await killSwitchState(ctx);
  if (k.global || k.workspace) return 'kill_switch';
  if (await breakerOpen(ctx, adAccountId)) return 'circuit_breaker_open';
  if (!(await connectionCanWrite(ctx, connectionId))) return 'no_write_access';
  return null;
}

const BLOCK_ERROR: Record<string, AppError> = {
  feature_disabled: new AppError('FEATURE_DISABLED', 'Không tìm thấy'),
  plan_required: new AppError('PLAN_REQUIRED', 'Cần gói Growth trở lên'),
  kill_switch: new AppError('KILL_SWITCH_ACTIVE', 'Kill switch đang bật'),
  circuit_breaker_open: new AppError('KILL_SWITCH_ACTIVE', 'Tài khoản đang tạm khóa do lỗi liên tiếp', {
    reason: 'circuit_breaker_open',
  }),
  no_write_access: new AppError('FORBIDDEN', 'Kết nối chưa có quyền ghi', { reason: 'no_write_access' }),
};

export type ActionRequest = {
  adAccountId: string;
  actionType: ActionType;
  targetMetaId: string;
  newDailyBudget?: string | null;
  recommendationId?: string | null;
  undoOf?: string | null;
};

/**
 * Bản xem trước cho hộp thoại duyệt (P202): trạng thái trước (theo lần đồng bộ gần nhất), sau mong đợi,
 * vi phạm guardrails, có hoàn tác được không. Không gọi Meta (web không giải mã token).
 */
export async function previewAction(ctx: ActorCtx, input: ActionRequest, clock: Clock = systemClock) {
  const now = clock.now();
  const account = (await listAdAccounts(ctx)).find((a) => a.id === input.adAccountId);
  if (!account) throw new AppError('NOT_FOUND', 'Không tìm thấy tài khoản');
  const type = TARGET_TYPE[input.actionType];
  const e = await targetEntity(ctx, account.id, type, input.targetMetaId);
  if (!e) throw new AppError('NOT_FOUND', 'Không tìm thấy đối tượng');
  const g = await effectiveGuardrails(ctx);
  const newBudget = input.actionType === 'set_adset_budget' ? minorUnits(input.newDailyBudget) : null;
  const before: State =
    input.actionType === 'set_adset_budget' ? { daily_budget: minorUnits(e.daily_budget) } : { status: e.status };
  const violations: GuardrailViolation[] = checkGuardrails({
    guardrails: g,
    actionType: input.actionType,
    tier: 'approve',
    targetIds: [input.targetMetaId, e.parent, e.campaign].filter((x): x is string => !!x),
    accountTimezone: account.timezone,
    now,
    actionsToday: await actionsToday(ctx, account.id, account.timezone, now),
    dataDays: await dataDays(ctx, account.id, type, input.targetMetaId, localDate(now, account.timezone)),
    currentDailyBudget: before.daily_budget ?? null,
    newDailyBudget: newBudget,
  });
  if (input.undoOf) {
    // Hoàn tác của hành động AdxLens đã làm: không tính vào giới hạn số hành động/ngày.
    const idx = violations.findIndex((v) => v.code === 'too_many_actions');
    if (idx >= 0) violations.splice(idx, 1);
  }
  return {
    account,
    targetType: type,
    targetName: e.name,
    before,
    after: expectedAfter(input.actionType, newBudget),
    violations,
    undoable: UNDOABLE[input.actionType],
  };
}

/**
 * Duyệt 1 click (P2-03): kiểm cờ, gói, kill switch, breaker, quyền ghi, vai trò theo Client, guardrails; tạo
 * action `pending` + nhật ký, enqueue `execute:action`. Không gọi Meta ở đây.
 */
export async function requestAction(
  ctx: ActorCtx,
  input: ActionRequest,
  deps: { enqueue: Enqueue; clock?: Clock },
): Promise<ActionRow> {
  const clock = deps.clock ?? systemClock;
  const p = await previewAction(ctx, input, clock);
  if (!p.account.clientId ? ctx.actor.role === 'buyer' : !canApproveActions(ctx.actor, p.account.clientId)) {
    throw new AppError('FORBIDDEN', 'Bạn không có quyền duyệt hành động cho Client này');
  }
  const block = await safetyBlock(ctx, p.account.id, p.account.connectionId);
  if (block) throw BLOCK_ERROR[block]!;
  if (p.violations.length) {
    throw new AppError('GUARDRAIL_VIOLATION', 'Vi phạm guardrails', { violations: p.violations });
  }
  const base = [
    ctx.workspaceId,
    input.recommendationId ?? 'manual',
    input.actionType,
    input.targetMetaId,
    JSON.stringify(p.after),
    input.undoOf ?? '',
  ].join(':');
  const prior = await ctx.db
    .select({ id: actions.id, status: actions.status, key: actions.idempotencyKey })
    .from(actions)
    .where(and(eq(actions.workspaceId, ctx.workspaceId), sql`${actions.idempotencyKey} like ${`${base}%`}`));
  const live = prior.find((a) => a.status === 'pending' || a.status === 'executing');
  if (live) throw new AppError('CONFLICT', 'Hành động này đang được thực hiện', { action_id: live.id });
  const [row] = await ctx.db
    .insert(actions)
    .values({
      workspaceId: ctx.workspaceId,
      adAccountId: p.account.id,
      recommendationId: input.recommendationId ?? null,
      actionType: input.actionType,
      targetType: p.targetType,
      targetMetaId: input.targetMetaId,
      targetName: p.targetName,
      tier: 'approve',
      params: p.after.daily_budget ? { daily_budget: p.after.daily_budget } : {},
      beforeState: p.before,
      afterExpected: p.after,
      idempotencyKey: `${base}#${prior.length + 1}`,
      requestedBy: ctx.actor.userId,
      approvedBy: ctx.actor.userId,
      undoOf: input.undoOf ?? null,
    })
    .returning();
  await log(ctx, row!.id, 'approved', { by: ctx.actor.userId, before: p.before, after: p.after });
  await deps.enqueue('execute:action', { workspaceId: ctx.workspaceId, actionId: row!.id });
  return row!;
}

function scrub(e: unknown): { code: string; message: string } {
  if (e instanceof MetaApiError) return { code: `meta_${e.code ?? e.status}`, message: e.message.slice(0, 300) };
  if (e instanceof AppError) return { code: e.code, message: e.message.slice(0, 300) };
  return { code: 'internal', message: 'Lỗi không xác định' };
}

function matches(obj: WritableObject, expected: State): boolean {
  if ('status' in expected) return obj.status === expected.status;
  if ('daily_budget' in expected) return minorUnits(obj.daily_budget ?? null) === expected.daily_budget;
  if ('copy_status' in expected) return obj.status === expected.copy_status;
  return false;
}

function snapshot(obj: WritableObject): State {
  return {
    status: obj.status ?? null,
    effective_status: obj.effective_status ?? null,
    daily_budget: minorUnits(obj.daily_budget ?? null),
  };
}

export type ExecuteDeps = { writer: MetaWriteApi; keys: TokenKeys; clock?: Clock; enqueue?: Enqueue };

/**
 * Worker thực thi (L3 7.4, ADR-0008): giành quyền chạy (pending → executing), kiểm lại an toàn + guardrails
 * với dữ liệu thật, so trạng thái thật với `before_state`, ghi một lần (không retry), đọc lại để xác minh,
 * cập nhật breaker, nhật ký, thông báo.
 */
export async function executeAction(
  ctx: WorkspaceCtx,
  actionId: string,
  deps: ExecuteDeps,
): Promise<{ status: 'success' | 'failed' | 'canceled' | 'skipped'; resultCode?: string }> {
  const clock = deps.clock ?? systemClock;
  const now = clock.now();
  const [claimed] = await ctx.db
    .update(actions)
    .set({ status: 'executing', updatedAt: now })
    .where(and(eq(actions.workspaceId, ctx.workspaceId), eq(actions.id, actionId), eq(actions.status, 'pending')))
    .returning();
  if (!claimed) return { status: 'skipped' };
  const a = claimed;
  const type = a.actionType as ActionType;
  const account = await accountOf(ctx, a.adAccountId);
  const finish = async (
    status: 'success' | 'failed' | 'canceled',
    resultCode: string,
    extra: Partial<typeof actions.$inferInsert> = {},
  ) => {
    await ctx.db
      .update(actions)
      .set({ status, resultCode, updatedAt: clock.now(), ...extra })
      .where(and(eq(actions.workspaceId, ctx.workspaceId), eq(actions.id, a.id)));
    await log(ctx, a.id, status, { result: resultCode, ...(extra.errorMessage ? { error: extra.errorMessage } : {}) });
    return { status, resultCode };
  };
  if (!account) return finish('canceled', 'account_missing');

  const block = await safetyBlock(ctx, account.id, account.connectionId);
  if (block) return finish('canceled', block);
  const g = await effectiveGuardrails(ctx);
  const e = await targetEntity(ctx, account.id, a.targetType, a.targetMetaId);
  const today = localDate(now, account.timezone);
  const violations = checkGuardrails({
    guardrails: g,
    actionType: type,
    tier: a.tier,
    targetIds: [a.targetMetaId, e?.parent, e?.campaign].filter((x): x is string => !!x),
    accountTimezone: account.timezone,
    now,
    actionsToday: a.undoOf ? 0 : await actionsToday(ctx, account.id, account.timezone, now, a.id),
    dataDays: await dataDays(ctx, account.id, a.targetType, a.targetMetaId, today),
    currentDailyBudget: a.beforeState.daily_budget ?? null,
    newDailyBudget: a.afterExpected.daily_budget ?? null,
  });
  if (violations.length)
    return finish('canceled', 'guardrail', { errorMessage: violations.map((v) => v.code).join(',') });

  const outcome = await withConnectionToken(ctx, account.connectionId, deps.keys, async (token) => {
    let live: WritableObject;
    try {
      live = await deps.writer.getObject(token, a.targetMetaId, a.targetType);
    } catch (err) {
      return { kind: 'failed' as const, code: 'read_failed', error: scrub(err) };
    }
    await log(ctx, a.id, 'before_live', snapshot(live));
    // Đã ở trạng thái đích → không gọi Meta.
    if (type !== 'duplicate_adset' && matches(live, a.afterExpected)) {
      return { kind: 'success' as const, code: 'no_change', after: snapshot(live) };
    }
    // Đối tượng đã bị đổi từ lúc duyệt → không ghi đè (ADR-0008 bước 6).
    const beforeOk =
      'daily_budget' in a.beforeState
        ? minorUnits(live.daily_budget ?? null) === a.beforeState.daily_budget
        : 'status' in a.beforeState && type !== 'duplicate_adset'
          ? live.status === a.beforeState.status
          : true;
    if (!beforeOk)
      return {
        kind: 'failed' as const,
        code: 'state_changed',
        error: { code: 'state_changed', message: 'Đối tượng đã thay đổi trên Meta sau khi duyệt' },
      };

    let callError: { code: string; message: string } | null = null;
    let verifyId = a.targetMetaId;
    try {
      if (type === 'set_adset_budget')
        await deps.writer.setDailyBudget(token, a.targetMetaId, a.afterExpected.daily_budget!);
      else if (type === 'duplicate_adset')
        verifyId = (await deps.writer.copyAdSet(token, a.targetMetaId)).copiedAdSetId;
      else await deps.writer.setStatus(token, a.targetMetaId, a.afterExpected.status as 'ACTIVE' | 'PAUSED');
      await log(ctx, a.id, 'meta_call', {
        ok: true,
        ...(verifyId !== a.targetMetaId ? { copied_adset_id: verifyId } : {}),
      });
    } catch (err) {
      callError = scrub(err);
      await log(ctx, a.id, 'meta_call', { ok: false, error: callError });
      // Nhân bản: không biết bản sao có được tạo không → không đoán, báo kiểm tra thủ công.
      if (type === 'duplicate_adset')
        return { kind: 'failed' as const, code: 'meta_error_check_manually', error: callError };
    }
    // Xác minh: đọc lại trạng thái thật (kể cả khi lời gọi báo lỗi — Meta có thể đã áp).
    let after: WritableObject;
    try {
      after = await deps.writer.getObject(token, verifyId, a.targetType);
    } catch (err) {
      return { kind: 'failed' as const, code: 'verify_failed', error: callError ?? scrub(err) };
    }
    const ok = matches(after, a.afterExpected);
    await log(ctx, a.id, 'verify', { ok, after: snapshot(after) });
    if (ok) {
      return {
        kind: 'success' as const,
        code: callError ? 'applied_despite_error' : 'ok',
        after: snapshot(after),
        copiedId: verifyId !== a.targetMetaId ? verifyId : undefined,
      };
    }
    return {
      kind: 'failed' as const,
      code: callError ? 'meta_error' : 'verify_mismatch',
      error: callError ?? { code: 'verify_mismatch', message: 'Trạng thái trên Meta không khớp kết quả mong đợi' },
      after: snapshot(after),
    };
  });

  const ts = clock.now();
  if (outcome.kind === 'success') {
    await recordSuccess(ctx, account.id);
    // Ghi xuyên trạng thái đã xác minh vào bản chụp cấu trúc (để xem trước / hoàn tác dùng trạng thái đúng
    // trước lần đồng bộ kế tiếp).
    if (type !== 'duplicate_adset') {
      await ctx.db
        .update(entities)
        .set(
          type === 'set_adset_budget'
            ? { dailyBudget: outcome.after.daily_budget ?? null, updatedAt: ts }
            : { status: outcome.after.status ?? null, updatedAt: ts },
        )
        .where(
          and(
            eq(entities.workspaceId, ctx.workspaceId),
            eq(entities.adAccountId, account.id),
            eq(entities.entityType, a.targetType),
            eq(entities.metaId, a.targetMetaId),
          ),
        );
    }
    const r = await finish('success', outcome.code, {
      afterState: outcome.after,
      executedAt: ts,
      verifiedAt: ts,
      ...(outcome.copiedId ? { params: { ...a.params, copied_adset_id: outcome.copiedId } } : {}),
    });
    // Gợi ý gốc (P101) → "Đã làm" khi hành động đã xác minh trên Meta.
    if (a.recommendationId && !a.undoOf) {
      await ctx.db
        .update(schema.recommendations)
        .set({ status: 'done', doneAt: ts, statusChangedBy: a.approvedBy, statusChangedAt: ts, updatedAt: ts })
        .where(
          and(
            eq(schema.recommendations.workspaceId, ctx.workspaceId),
            eq(schema.recommendations.id, a.recommendationId),
            inArray(schema.recommendations.status, ['proposed', 'in_progress']),
          ),
        );
    }
    if (a.undoOf) {
      await ctx.db
        .update(actions)
        .set({ status: 'undone', updatedAt: ts })
        .where(and(eq(actions.workspaceId, ctx.workspaceId), eq(actions.id, a.undoOf)));
      await log(ctx, a.undoOf, 'undone', { by_action: a.id });
    }
    if (a.requestedBy) {
      await notify(ctx, {
        kind: 'action_executed',
        recipients: { userIds: [a.requestedBy] },
        params: { action: a.actionType, item: a.targetName ?? a.targetMetaId },
        link: `/action-log/${a.id}`,
        dedupeKey: `action_executed:${a.id}`,
      });
    }
    return r;
  }
  const r = await finish('failed', outcome.code, {
    errorMessage: outcome.error.message,
    executedAt: ts,
    ...('after' in outcome && outcome.after ? { afterState: outcome.after } : {}),
  });
  const opened = await recordFailure(ctx, account.id, g.breakerFailures, clock);
  await notify(
    ctx,
    {
      kind: 'action_failed',
      recipients: { roles: ['owner'], userIds: a.requestedBy ? [a.requestedBy] : [] },
      params: { action: a.targetName ?? a.targetMetaId, reason: outcome.error.message },
      link: `/action-log/${a.id}`,
      dedupeKey: `action_failed:${a.id}`,
    },
    { enqueue: deps.enqueue },
  );
  // Playbook `execution_failed` (L3 12): mọi thất bại mở / gom sự cố; breaker vừa mở → P1 và hủy hành động đang
  // chờ của tài khoản (hệ thống tự về trạng thái an toàn trước khi PM xử lý).
  await openIncident(ctx.db, {
    kind: 'execution_failed',
    severity: opened ? 'P1' : 'P2',
    source: 'execution',
    title: opened ? 'Tạm khóa thực thi do lỗi liên tiếp' : 'Hành động trên Meta thất bại',
    fingerprint: `execution_failed:${account.id}`,
    workspaceId: ctx.workspaceId,
    adAccountId: account.id,
    detail: { action_id: a.id, action_type: a.actionType, result: outcome.code },
  });
  if (opened) {
    await log(ctx, a.id, 'circuit_breaker_opened', { ad_account_id: account.id });
    await cancelPending(ctx, 'circuit_breaker_open', { adAccountId: account.id });
  }
  return r;
}

/** Đếm hành động theo trạng thái (AD/ops dùng). */
export async function actionCounts(ctx: WorkspaceCtx) {
  return ctx.db
    .select({ status: actions.status, n: count() })
    .from(actions)
    .where(eq(actions.workspaceId, ctx.workspaceId))
    .groupBy(actions.status);
}
