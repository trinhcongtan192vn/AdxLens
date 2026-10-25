import { and, count, eq, gte, inArray, sql } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import type { Enqueue } from '@adxlens/jobs';
import {
  connectionCanWrite,
  listAdAccounts,
  listAssets,
  withConnectionToken,
  type TokenKeys,
} from '@adxlens/core/connections';
import { isEnabled } from '@adxlens/core/flags';
import { MetaApiError } from '@adxlens/meta-client';
import { adSetTargeting, PIXEL_EVENTS, type MetaWriteApi, type WritableObject } from '@adxlens/meta-client/write';
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
import {
  checkGuardrails,
  effectiveGuardrails,
  RENAME_TYPES,
  VALUE_FIELD,
  type ActionType,
  type GuardrailViolation,
} from './guardrails';
import { breakerOpen, cancelPending, killSwitchState, recordFailure, recordSuccess } from './safety';

const { actions, actionLogs, adAccounts, entities } = schema;

type State = Record<string, string | null>;
export type ActionRow = typeof actions.$inferSelect;

const TARGET_TYPE: Record<ActionType, 'ad' | 'adset' | 'campaign' | 'account'> = {
  pause_ad: 'ad',
  resume_ad: 'ad',
  pause_adset: 'adset',
  resume_adset: 'adset',
  set_adset_budget: 'adset',
  duplicate_adset: 'adset',
  create_ad: 'adset',
  create_lookalike: 'account',
  create_custom_audience: 'account',
  create_adset: 'campaign',
  pause_campaign: 'campaign',
  resume_campaign: 'campaign',
  rename_ad: 'ad',
  rename_adset: 'adset',
  rename_campaign: 'campaign',
  set_adset_bid: 'adset',
  set_campaign_spend_cap: 'campaign',
};

const LAUNCH_TYPES = new Set<ActionType>(['create_ad', 'create_lookalike', 'create_custom_audience', 'create_adset']);

/** Hoàn tác được hay không (ADR-0009..0011). */
export const UNDOABLE: Record<ActionType, boolean> = {
  pause_ad: true,
  resume_ad: true,
  pause_adset: true,
  resume_adset: true,
  set_adset_budget: true,
  duplicate_adset: false,
  create_ad: false,
  create_lookalike: false,
  create_custom_audience: false,
  create_adset: false,
  pause_campaign: true,
  resume_campaign: true,
  rename_ad: true,
  rename_adset: true,
  rename_campaign: true,
  set_adset_bid: true,
  set_campaign_spend_cap: true,
};

/** ADR-0025: tên mới đã chuẩn hóa (bỏ khoảng trắng hai đầu, 1–400 ký tự, không ký tự điều khiển) hoặc null. */
export function cleanName(v: string | null | undefined): string | null {
  const s = (v ?? '').trim();
  // eslint-disable-next-line no-control-regex
  if (!s || s.length > 400 || /[\u0000-\u001f\u007f]/.test(s)) return null;
  return s;
}

/** Đơn vị nhỏ nhất của tiền tệ dạng số nguyên (ngân sách Meta) từ chuỗi numeric. */
export function minorUnits(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const m = /^(\d+)(?:\.(\d+))?$/.exec(v.trim());
  if (!m) return null;
  return String(BigInt(m[1]!)); // phần lẻ của đơn vị nhỏ nhất bị bỏ (làm tròn xuống)
}

function expectedAfter(
  type: ActionType,
  newBudget?: string | null,
  newName?: string | null,
  newValue?: string | null,
): State {
  if (RENAME_TYPES.has(type)) return { name: newName ?? null };
  const field = VALUE_FIELD[type];
  if (field) return { [field]: newValue ?? null };
  if (type === 'pause_ad' || type === 'pause_adset' || type === 'pause_campaign') return { status: 'PAUSED' };
  if (type === 'resume_ad' || type === 'resume_adset' || type === 'resume_campaign') return { status: 'ACTIVE' };
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
async function dataDays(
  ctx: WorkspaceCtx,
  adAccountId: string,
  type: 'ad' | 'adset' | 'campaign',
  metaId: string,
  today: string,
) {
  const col = type === 'ad' ? sql`meta_id` : type === 'adset' ? sql`adset_id` : sql`campaign_id`;
  const [r] = await ctx.db.execute<{ n: string }>(sql`
    select count(distinct date)::text as n from analytics.insights_daily
    where workspace_id = ${ctx.workspaceId} and ad_account_id = ${adAccountId} and ${col} = ${metaId}
      and impressions > 0 and date between ${addDays(today, -30)} and ${addDays(today, -1)}`);
  return Number(r?.n ?? 0);
}

async function targetEntity(ctx: WorkspaceCtx, adAccountId: string, type: 'ad' | 'adset' | 'campaign', metaId: string) {
  const [e] = await ctx.db.execute<{
    name: string | null;
    status: string | null;
    daily_budget: string | null;
    bid_amount: string | null;
    spend_cap: string | null;
    parent: string | null;
    campaign: string | null;
  }>(sql`
    select e.name, e.status, e.daily_budget::text as daily_budget, e.parent_meta_id as parent,
      e.attrs->>'bid_amount' as bid_amount, e.attrs->>'spend_cap' as spend_cap,
      coalesce(e.attrs->>'campaign_id', p.parent_meta_id) as campaign
    from analytics.entities e
    left join analytics.entities p on p.workspace_id = e.workspace_id and p.ad_account_id = e.ad_account_id
      and p.entity_type = 'adset' and p.meta_id = e.parent_meta_id
    where e.workspace_id = ${ctx.workspaceId} and e.ad_account_id = ${adAccountId}
      and e.entity_type = ${type} and e.meta_id = ${metaId}`);
  return e ?? null;
}

/** Trạng thái trước theo lần đồng bộ gần nhất (thuộc tính mà hành động sẽ đổi). */
function beforeOf(
  type: ActionType,
  e: {
    name: string | null;
    status: string | null;
    daily_budget: string | null;
    bid_amount?: string | null;
    spend_cap?: string | null;
  },
) {
  if (type === 'set_adset_budget') return { daily_budget: minorUnits(e.daily_budget) } as State;
  const field = VALUE_FIELD[type];
  if (field) return { [field]: minorUnits(e[field] ?? null) } as State;
  if (RENAME_TYPES.has(type)) return { name: e.name } as State;
  return { status: e.status } as State;
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
  // ADR-0024: cờ hiệu lực đã gồm gói (toàn app × gói, hoặc ngoại lệ của workspace) — một cổng duy nhất.
  if (!(await isEnabled(ctx, 'p2a_approve'))) return 'feature_disabled';
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
  /** ADR-0025: tên mới cho `rename_*`. */
  newName?: string | null;
  /** ADR-0025: giá thầu / giới hạn chi mới (đơn vị nhỏ nhất của tiền tệ, như ngân sách). */
  newValue?: string | null;
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
  if (type === 'account' || LAUNCH_TYPES.has(input.actionType)) {
    throw new AppError('VALIDATION_FAILED', 'Tạo mới đi qua Ad / Audience Launcher');
  }
  const e = await targetEntity(ctx, account.id, type, input.targetMetaId);
  if (!e) throw new AppError('NOT_FOUND', 'Không tìm thấy đối tượng');
  const g = await effectiveGuardrails(ctx);
  const newBudget = input.actionType === 'set_adset_budget' ? minorUnits(input.newDailyBudget) : null;
  const before = beforeOf(input.actionType, e);
  const newName = RENAME_TYPES.has(input.actionType) ? cleanName(input.newName) : null;
  if (RENAME_TYPES.has(input.actionType)) {
    if (!newName) throw new AppError('VALIDATION_FAILED', 'Tên mới không hợp lệ (1–400 ký tự)');
    if (newName === e.name) throw new AppError('VALIDATION_FAILED', 'Tên mới trùng tên hiện tại');
  }
  const field = VALUE_FIELD[input.actionType];
  const newValue = field ? minorUnits(input.newValue) : null;
  if (field && newValue !== null && newValue === before[field]) {
    throw new AppError('VALIDATION_FAILED', 'Giá trị mới trùng giá trị hiện tại');
  }
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
    currentValue: field ? (before[field] ?? null) : null,
    newValue,
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
    after: expectedAfter(input.actionType, newBudget, newName, newValue),
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
      params: Object.fromEntries(
        Object.entries(p.after).filter(
          (x): x is [string, string] => ['daily_budget', 'name', 'bid_amount', 'spend_cap'].includes(x[0]) && !!x[1],
        ),
      ),
      beforeState: p.before,
      afterExpected: p.after,
      idempotencyKey: `${base}#${prior.length + 1}`,
      requestedBy: ctx.actor.userId,
      approvedBy: ctx.actor.userId,
      undoOf: input.undoOf ?? null,
      // Cùng đồng hồ với guardrail "số hành động hôm nay" (không để DB tự đặt giờ khác ngày với lúc kiểm).
      createdAt: clock.now(),
    })
    .returning();
  await log(ctx, row!.id, 'approved', { by: ctx.actor.userId, before: p.before, after: p.after });
  await deps.enqueue('execute:action', { workspaceId: ctx.workspaceId, actionId: row!.id });
  return row!;
}

/** Một đối tượng không bị cùng rule thao tác lại trong 24 giờ (ADR-0012 mục 6). */
export const AUTO_COOLDOWN_MS = 24 * 3_600_000;

/**
 * Hành động `tier=auto` do rule live tạo (P2b, ADR-0012): cùng cổng an toàn như duyệt tay (cờ duyệt hành
 * động + cờ tự chạy, gói, kill switch, breaker, quyền ghi) và guardrails `auto` (giờ yên lặng, không bật lại /
 * nhân bản, giới hạn số hành động/ngày chặt hơn của rule, loại trừ). Trả action hoặc lý do bỏ qua.
 */
export async function requestAutoAction(
  ctx: WorkspaceCtx,
  input: {
    ruleId: string;
    adAccountId: string;
    actionType: ActionType;
    targetMetaId: string;
    newDailyBudget?: string | null;
    ruleMaxActionsPerDay?: number;
    ruleExcludeMetaIds?: string[];
    /** ADR-0021: cooldown của rule (≥ 24 giờ, chặt hơn mặc định). */
    cooldownHours?: number;
    /**
     * ADR-0021: hành động trả về trạng thái trước rule (Surf trả ngân sách). Chỉ bỏ cooldown cùng rule cho hành động
     * này — mọi guardrail, kill switch, breaker, quyền ghi vẫn kiểm; `before_state` = `after_expected` của gốc.
     */
    revertOf?: { actionId: string; expectedState: Record<string, string | null> };
  },
  deps: { enqueue: Enqueue; clock?: Clock },
): Promise<{ action: ActionRow } | { skipped: string }> {
  const now = (deps.clock ?? systemClock).now();
  const account = await accountOf(ctx, input.adAccountId);
  if (!account) return { skipped: 'account_missing' };
  if (!(await isEnabled(ctx, 'p2b_auto'))) return { skipped: 'feature_disabled' };
  const block = await safetyBlock(ctx, account.id, account.connectionId);
  if (block) return { skipped: block };
  const [recent] = await ctx.db
    .select({ id: actions.id })
    .from(actions)
    .where(
      and(
        eq(actions.workspaceId, ctx.workspaceId),
        eq(actions.ruleId, input.ruleId),
        eq(actions.targetMetaId, input.targetMetaId),
        inArray(actions.status, ['pending', 'executing', 'success']),
        gte(
          actions.createdAt,
          new Date(now.getTime() - Math.max(AUTO_COOLDOWN_MS, (input.cooldownHours ?? 0) * 3_600_000)),
        ),
      ),
    )
    .limit(1);
  if (recent && !input.revertOf) return { skipped: 'cooldown' };
  const type = TARGET_TYPE[input.actionType];
  if (type === 'account' || LAUNCH_TYPES.has(input.actionType)) return { skipped: 'no_auto_create' };
  const e = await targetEntity(ctx, account.id, type, input.targetMetaId);
  if (!e) return { skipped: 'target_missing' };
  const g = await effectiveGuardrails(ctx);
  const newBudget = input.actionType === 'set_adset_budget' ? minorUnits(input.newDailyBudget) : null;
  const before: State = input.revertOf ? input.revertOf.expectedState : beforeOf(input.actionType, e);
  const after = expectedAfter(input.actionType, newBudget);
  const violations = checkGuardrails({
    guardrails: {
      ...g,
      maxActionsPerDay: Math.min(g.maxActionsPerDay, input.ruleMaxActionsPerDay ?? g.maxActionsPerDay),
      excludeMetaIds: [...g.excludeMetaIds, ...(input.ruleExcludeMetaIds ?? [])],
    },
    actionType: input.actionType,
    tier: 'auto',
    targetIds: [input.targetMetaId, e.parent, e.campaign].filter((x): x is string => !!x),
    accountTimezone: account.timezone,
    now,
    actionsToday: await actionsToday(ctx, account.id, account.timezone, now),
    dataDays: await dataDays(ctx, account.id, type, input.targetMetaId, localDate(now, account.timezone)),
    currentDailyBudget: before.daily_budget ?? null,
    newDailyBudget: newBudget,
  });
  if (violations.length) return { skipped: violations.map((v) => v.code).join(',') };
  const [row] = await ctx.db
    .insert(actions)
    .values({
      workspaceId: ctx.workspaceId,
      adAccountId: account.id,
      ruleId: input.ruleId,
      actionType: input.actionType,
      targetType: type,
      targetMetaId: input.targetMetaId,
      targetName: e.name,
      tier: 'auto',
      params: after.daily_budget ? { daily_budget: after.daily_budget } : {},
      beforeState: before,
      afterExpected: after,
      idempotencyKey: input.revertOf
        ? `${ctx.workspaceId}:revert:${input.revertOf.actionId}`
        : `${ctx.workspaceId}:rule:${input.ruleId}:${input.targetMetaId}:${now.toISOString()}`,
      // Cùng đồng hồ với guardrail "số hành động hôm nay" và cooldown 24 giờ.
      createdAt: now,
    })
    .returning();
  await log(ctx, row!.id, 'auto_requested', {
    rule_id: input.ruleId,
    before,
    after,
    ...(input.revertOf ? { revert_of: input.revertOf.actionId } : {}),
  });
  await deps.enqueue('execute:action', { workspaceId: ctx.workspaceId, actionId: row!.id });
  return { action: row! };
}

function scrub(e: unknown): { code: string; message: string } {
  if (e instanceof MetaApiError) return { code: `meta_${e.code ?? e.status}`, message: e.message.slice(0, 300) };
  if (e instanceof AppError) return { code: e.code, message: e.message.slice(0, 300) };
  return { code: 'internal', message: 'Lỗi không xác định' };
}

function matches(obj: WritableObject, expected: State): boolean {
  if ('name' in expected) return (obj.name ?? null) === expected.name;
  if ('bid_amount' in expected) return minorUnits(obj.bid_amount ?? null) === expected.bid_amount;
  if ('spend_cap' in expected) return minorUnits(obj.spend_cap ?? null) === expected.spend_cap;
  if ('status' in expected) return obj.status === expected.status;
  if ('daily_budget' in expected) return minorUnits(obj.daily_budget ?? null) === expected.daily_budget;
  if ('copy_status' in expected) return obj.status === expected.copy_status;
  return false;
}

function snapshot(obj: WritableObject): State {
  return {
    name: obj.name ?? null,
    status: obj.status ?? null,
    effective_status: obj.effective_status ?? null,
    daily_budget: minorUnits(obj.daily_budget ?? null),
    bid_amount: minorUnits(obj.bid_amount ?? null),
    spend_cap: minorUnits(obj.spend_cap ?? null),
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
  if (LAUNCH_TYPES.has(type)) return executeLaunch(ctx, a, account, deps, finish);
  const g = await effectiveGuardrails(ctx);
  if (a.targetType === 'account') return finish('canceled', 'invalid_target');
  const objType: 'ad' | 'adset' | 'campaign' = a.targetType;
  const e = await targetEntity(ctx, account.id, objType, a.targetMetaId);
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
    currentValue: VALUE_FIELD[type] ? (a.beforeState[VALUE_FIELD[type]!] ?? null) : null,
    newValue: VALUE_FIELD[type] ? (a.afterExpected[VALUE_FIELD[type]!] ?? null) : null,
  });
  if (violations.length)
    return finish('canceled', 'guardrail', { errorMessage: violations.map((v) => v.code).join(',') });

  const outcome = await withConnectionToken(ctx, account.connectionId, deps.keys, async (token) => {
    let live: WritableObject;
    try {
      live = await deps.writer.getObject(token, a.targetMetaId, objType);
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
      'name' in a.beforeState
        ? (live.name ?? null) === a.beforeState.name
        : 'bid_amount' in a.beforeState
          ? minorUnits(live.bid_amount ?? null) === a.beforeState.bid_amount
          : 'spend_cap' in a.beforeState
            ? minorUnits(live.spend_cap ?? null) === a.beforeState.spend_cap
            : 'daily_budget' in a.beforeState
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
      else if (RENAME_TYPES.has(type)) await deps.writer.setName(token, a.targetMetaId, a.afterExpected.name!);
      else if (type === 'set_adset_bid')
        await deps.writer.setBidAmount(token, a.targetMetaId, a.afterExpected.bid_amount!);
      else if (type === 'set_campaign_spend_cap')
        await deps.writer.setSpendCap(token, a.targetMetaId, a.afterExpected.spend_cap!);
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
      after = await deps.writer.getObject(token, verifyId, objType);
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
            : RENAME_TYPES.has(type)
              ? { name: outcome.after.name ?? null, updatedAt: ts }
              : VALUE_FIELD[type]
                ? {
                    attrs: sql`${entities.attrs} || ${JSON.stringify({
                      [VALUE_FIELD[type]!]: outcome.after[VALUE_FIELD[type]!] ?? null,
                    })}::jsonb`,
                    updatedAt: ts,
                  }
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
  // L2 11.2: hành động tự động thất bại → tạm dừng rule tạo ra nó (người dùng xem lại rồi bật lại).
  if (a.ruleId) {
    const paused = await ctx.db
      .update(schema.automationRules)
      .set({ mode: 'paused', updatedAt: ts })
      .where(
        and(
          eq(schema.automationRules.workspaceId, ctx.workspaceId),
          eq(schema.automationRules.id, a.ruleId),
          eq(schema.automationRules.mode, 'live'),
        ),
      )
      .returning({ id: schema.automationRules.id });
    if (paused.length) await log(ctx, a.id, 'rule_paused', { rule_id: a.ruleId });
  }
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

type LaunchInput =
  | { kind: 'create_ad'; adAccountId: string; adsetId: string; creativeId: string; name: string }
  | {
      kind: 'create_lookalike';
      adAccountId: string;
      originAudienceId: string;
      country: string;
      ratioPct: number;
      name: string;
    }
  | {
      /** ADR-0026: pixel (sự kiện website) hoặc tương tác Page / Instagram — nguồn phải là tài sản của workspace. */
      kind: 'create_custom_audience';
      adAccountId: string;
      source:
        | { type: 'pixel'; id: string; event: 'all' | (typeof PIXEL_EVENTS)[number]; days: number }
        | { type: 'page' | 'ig_business'; id: string; days: number };
      name: string;
    }
  | {
      /** ADR-0026: nhóm QC mới (PAUSED) trong chiến dịch của nhóm QC mẫu; thiết lập tối ưu chép từ mẫu. */
      kind: 'create_adset';
      adAccountId: string;
      templateAdsetId: string;
      name: string;
      /** Đơn vị nhỏ nhất (như ngân sách); null khi chiến dịch dùng ngân sách chiến dịch. */
      dailyBudget: string | null;
      countries: string[];
      ageMin: number;
      ageMax: number;
      audienceIds: string[];
    };

/**
 * ADR-0023 — Ad Launcher / Audience Launcher: tạo hành động `create_ad` / `create_lookalike` tier `approve` (duyệt
 * tay, không bao giờ auto). Đủ cổng an toàn như mọi hành động ghi; nguồn (ad set, creative, audience) phải thuộc tài
 * khoản QC của workspace theo snapshot. Quảng cáo mới luôn PAUSED. Không hoàn tác được.
 */
export async function requestLaunch(
  ctx: ActorCtx,
  input: LaunchInput,
  deps: { enqueue: Enqueue; clock?: Clock },
): Promise<ActionRow> {
  const clock = deps.clock ?? systemClock;
  const now = clock.now();
  const account = (await listAdAccounts(ctx)).find((x) => x.id === input.adAccountId);
  if (!account) throw new AppError('NOT_FOUND', 'Không tìm thấy tài khoản');
  if (!account.clientId ? ctx.actor.role === 'buyer' : !canApproveActions(ctx.actor, account.clientId)) {
    throw new AppError('FORBIDDEN', 'Bạn không có quyền duyệt hành động cho Client này');
  }
  const block = await safetyBlock(ctx, account.id, account.connectionId);
  if (block) throw BLOCK_ERROR[block]!;
  const name = input.name.trim().slice(0, 200);
  if (!name) throw new AppError('VALIDATION_FAILED', 'Cần tên');
  let targetType: 'adset' | 'campaign' | 'account';
  let targetMetaId: string;
  let targetName: string | null;
  let params: Record<string, string>;
  let parents: string[] = [];
  if (input.kind === 'create_ad') {
    const adset = await targetEntity(ctx, account.id, 'adset', input.adsetId);
    if (!adset) throw new AppError('NOT_FOUND', 'Không tìm thấy nhóm QC');
    const [cr] = await ctx.db
      .select({ id: entities.metaId })
      .from(entities)
      .where(
        and(
          eq(entities.workspaceId, ctx.workspaceId),
          eq(entities.adAccountId, account.id),
          eq(entities.entityType, 'creative'),
          eq(entities.metaId, input.creativeId),
        ),
      );
    if (!cr) throw new AppError('NOT_FOUND', 'Không tìm thấy creative');
    targetType = 'adset';
    targetMetaId = input.adsetId;
    targetName = adset.name;
    params = { creative_id: input.creativeId, name };
    parents = [input.adsetId, adset.parent, adset.campaign].filter((x): x is string => !!x);
  } else if (input.kind === 'create_adset') {
    const tpl = await targetEntity(ctx, account.id, 'adset', input.templateAdsetId);
    if (!tpl || !tpl.parent) throw new AppError('NOT_FOUND', 'Không tìm thấy nhóm QC mẫu');
    const audienceIds = [...new Set(input.audienceIds)];
    if (audienceIds.length) {
      const found = await ctx.db
        .select({ id: entities.metaId })
        .from(entities)
        .where(
          and(
            eq(entities.workspaceId, ctx.workspaceId),
            eq(entities.adAccountId, account.id),
            eq(entities.entityType, 'audience'),
            inArray(entities.metaId, audienceIds),
          ),
        );
      if (found.length !== audienceIds.length) throw new AppError('NOT_FOUND', 'Không tìm thấy audience');
    }
    const countries = [...new Set(input.countries.map((c) => c.trim().toUpperCase()))];
    try {
      adSetTargeting({ countries, ageMin: input.ageMin, ageMax: input.ageMax, audienceIds });
    } catch (e) {
      throw new AppError('VALIDATION_FAILED', e instanceof Error ? e.message : 'Nhắm mục tiêu không hợp lệ');
    }
    // Mẫu dùng ngân sách nhóm QC → cần ngân sách ngày; mẫu dùng ngân sách chiến dịch → không đặt.
    const tplBudget = minorUnits(tpl.daily_budget);
    const budget = tplBudget ? minorUnits(input.dailyBudget) : null;
    if (tplBudget && (!budget || budget === '0')) throw new AppError('VALIDATION_FAILED', 'Cần ngân sách ngày');
    targetType = 'campaign';
    targetMetaId = tpl.parent;
    targetName = tpl.name;
    params = {
      template_id: input.templateAdsetId,
      campaign_id: tpl.parent,
      name,
      daily_budget: budget ?? '',
      template_daily_budget: tplBudget ?? '',
      countries: countries.join(','),
      age_min: String(input.ageMin),
      age_max: String(input.ageMax),
      audience_ids: audienceIds.join(','),
    };
    parents = [input.templateAdsetId, tpl.parent];
  } else if (input.kind === 'create_custom_audience') {
    const src = input.source;
    const max = src.type === 'pixel' ? 180 : 365;
    if (!Number.isInteger(src.days) || src.days < 1 || src.days > max) {
      throw new AppError('VALIDATION_FAILED', `Số ngày 1–${max}`);
    }
    if (src.type === 'pixel' && src.event !== 'all' && !PIXEL_EVENTS.includes(src.event)) {
      throw new AppError('VALIDATION_FAILED', 'Sự kiện pixel không hợp lệ');
    }
    // Nguồn là tài sản đã đồng bộ của workspace (ADR-0016); pixel phải thuộc đúng tài khoản QC.
    const assets = await listAssets(ctx, src.type === 'pixel' ? 'pixel' : src.type === 'page' ? 'page' : 'instagram');
    const asset = assets.find((x) => x.metaId === src.id);
    if (!asset || (src.type === 'pixel' && asset.parentId && asset.parentId !== account.metaAccountId)) {
      throw new AppError('NOT_FOUND', 'Không tìm thấy nguồn audience');
    }
    targetType = 'account';
    targetMetaId = account.metaAccountId;
    targetName = account.name;
    params = {
      source_type: src.type,
      source_id: src.id,
      source_name: asset.name,
      event: src.type === 'pixel' ? src.event : '',
      days: String(src.days),
      name,
    };
  } else {
    if (!/^[A-Z]{2}$/.test(input.country)) throw new AppError('VALIDATION_FAILED', 'Mã quốc gia 2 chữ');
    if (!Number.isInteger(input.ratioPct) || input.ratioPct < 1 || input.ratioPct > 10) {
      throw new AppError('VALIDATION_FAILED', 'Tỷ lệ lookalike 1–10%');
    }
    const [au] = await ctx.db
      .select({ id: entities.metaId, name: entities.name })
      .from(entities)
      .where(
        and(
          eq(entities.workspaceId, ctx.workspaceId),
          eq(entities.adAccountId, account.id),
          eq(entities.entityType, 'audience'),
          eq(entities.metaId, input.originAudienceId),
        ),
      );
    if (!au) throw new AppError('NOT_FOUND', 'Không tìm thấy audience gốc');
    targetType = 'account';
    targetMetaId = account.metaAccountId;
    targetName = account.name;
    params = {
      origin_audience_id: input.originAudienceId,
      country: input.country,
      ratio: (input.ratioPct / 100).toFixed(2),
      name,
    };
  }
  const g = await effectiveGuardrails(ctx);
  const violations = checkGuardrails({
    guardrails: g,
    actionType: input.kind,
    tier: 'approve',
    targetIds: parents,
    accountTimezone: account.timezone,
    now,
    actionsToday: await actionsToday(ctx, account.id, account.timezone, now),
    // Tạo mới không cần lịch sử dữ liệu của đối tượng.
    dataDays: g.minDataDays,
    currentDailyBudget: params.template_daily_budget || null,
    newDailyBudget: params.daily_budget || null,
  });
  if (violations.length) throw new AppError('GUARDRAIL_VIOLATION', 'Vi phạm guardrails', { violations });
  const after: Record<string, string | null> =
    input.kind === 'create_ad' || input.kind === 'create_adset'
      ? { created_status: 'PAUSED' }
      : input.kind === 'create_custom_audience'
        ? { created_subtype: input.source.type === 'pixel' ? 'WEBSITE' : 'ENGAGEMENT' }
        : { created_subtype: 'LOOKALIKE' };
  const [row] = await ctx.db
    .insert(actions)
    .values({
      workspaceId: ctx.workspaceId,
      adAccountId: account.id,
      actionType: input.kind,
      targetType,
      targetMetaId,
      targetName,
      tier: 'approve',
      params,
      beforeState: {},
      afterExpected: after,
      idempotencyKey: `${ctx.workspaceId}:launch:${input.kind}:${JSON.stringify(params)}:${now.toISOString()}`,
      requestedBy: ctx.actor.userId,
      approvedBy: ctx.actor.userId,
      createdAt: now,
    })
    .returning();
  await log(ctx, row!.id, 'approved', { by: ctx.actor.userId, params, after });
  await deps.enqueue('execute:action', { workspaceId: ctx.workspaceId, actionId: row!.id });
  return row!;
}

/** Thực thi tạo mới (ADR-0023): ghi một lần, đọc lại xác minh; lỗi giữa chừng → không đoán, báo kiểm tra thủ công. */
async function executeLaunch(
  ctx: WorkspaceCtx,
  a: ActionRow,
  account: { id: string; connectionId: string; timezone: string },
  deps: ExecuteDeps,
  finish: (
    status: 'success' | 'failed' | 'canceled',
    resultCode: string,
    extra?: Partial<typeof actions.$inferInsert>,
  ) => Promise<{ status: 'success' | 'failed' | 'canceled'; resultCode: string }>,
) {
  const clock = deps.clock ?? systemClock;
  const g = await effectiveGuardrails(ctx);
  const violations = checkGuardrails({
    guardrails: g,
    actionType: a.actionType as ActionType,
    tier: a.tier,
    targetIds:
      a.targetType === 'adset'
        ? [a.targetMetaId]
        : a.actionType === 'create_adset'
          ? [a.targetMetaId, a.params.template_id!]
          : [],
    accountTimezone: account.timezone,
    now: clock.now(),
    actionsToday: await actionsToday(ctx, account.id, account.timezone, clock.now(), a.id),
    dataDays: g.minDataDays,
    currentDailyBudget: a.params.template_daily_budget || null,
    newDailyBudget: a.params.daily_budget || null,
  });
  if (violations.length)
    return finish('canceled', 'guardrail', { errorMessage: violations.map((v) => v.code).join(',') });
  const [acc] = await ctx.db
    .select({ metaAccountId: adAccounts.metaAccountId })
    .from(adAccounts)
    .where(and(eq(adAccounts.workspaceId, ctx.workspaceId), eq(adAccounts.id, account.id)));
  const act = acc!.metaAccountId;
  const done = (after: Record<string, string | null>) => ({ kind: 'success' as const, after });
  const outcome = await withConnectionToken(ctx, account.connectionId, deps.keys, async (token) => {
    let createdId: string;
    try {
      createdId =
        a.actionType === 'create_ad'
          ? (
              await deps.writer.createAd(token, act, {
                name: a.params.name!,
                adsetId: a.targetMetaId,
                creativeId: a.params.creative_id!,
              })
            ).id
          : a.actionType === 'create_adset'
            ? (
                await deps.writer.createAdSet(token, act, {
                  name: a.params.name!,
                  templateAdSetId: a.params.template_id!,
                  dailyBudget: a.params.daily_budget || null,
                  targeting: {
                    countries: a.params.countries!.split(','),
                    ageMin: Number(a.params.age_min),
                    ageMax: Number(a.params.age_max),
                    audienceIds: a.params.audience_ids ? a.params.audience_ids.split(',') : [],
                  },
                })
              ).id
            : a.actionType === 'create_custom_audience'
              ? (
                  await deps.writer.createCustomAudience(token, act, {
                    name: a.params.name!,
                    source:
                      a.params.source_type === 'pixel'
                        ? {
                            type: 'pixel',
                            id: a.params.source_id!,
                            event: a.params.event as 'all',
                            days: Number(a.params.days),
                          }
                        : {
                            type: a.params.source_type as 'page' | 'ig_business',
                            id: a.params.source_id!,
                            days: Number(a.params.days),
                          },
                  })
                ).id
              : (
                  await deps.writer.createLookalike(token, act, {
                    name: a.params.name!,
                    originAudienceId: a.params.origin_audience_id!,
                    country: a.params.country!,
                    ratio: a.params.ratio!,
                  })
                ).id;
      await log(ctx, a.id, 'meta_call', { ok: true, created_id: createdId });
    } catch (err) {
      const e = scrub(err);
      await log(ctx, a.id, 'meta_call', { ok: false, error: e });
      return { kind: 'failed' as const, code: 'meta_error_check_manually', error: e };
    }
    try {
      if (a.actionType === 'create_adset') {
        const s = await deps.writer.getObject(token, createdId, 'adset');
        const ok = s.status === 'PAUSED' && s.campaign_id === a.params.campaign_id;
        await log(ctx, a.id, 'verify', { ok, after: { created_id: createdId, status: s.status ?? null } });
        return ok
          ? done({ created_id: createdId, created_status: s.status ?? null })
          : {
              kind: 'failed' as const,
              code: 'verify_mismatch',
              error: { code: 'verify_mismatch', message: 'Nhóm QC mới không ở trạng thái mong đợi' },
            };
      }
      if (a.actionType === 'create_ad') {
        const ad = await deps.writer.getObject(token, createdId, 'ad');
        const ok = ad.status === 'PAUSED' && ad.adset_id === a.targetMetaId;
        await log(ctx, a.id, 'verify', { ok, after: { created_id: createdId, status: ad.status ?? null } });
        return ok
          ? done({ created_id: createdId, created_status: ad.status ?? null })
          : {
              kind: 'failed' as const,
              code: 'verify_mismatch',
              error: { code: 'verify_mismatch', message: 'Quảng cáo mới không ở trạng thái mong đợi' },
            };
      }
      const au = await deps.writer.getAudience(token, createdId);
      const ok = au.subtype === a.afterExpected.created_subtype;
      await log(ctx, a.id, 'verify', { ok, after: { created_id: createdId, subtype: au.subtype ?? null } });
      return ok
        ? done({ created_id: createdId, created_subtype: au.subtype ?? null })
        : {
            kind: 'failed' as const,
            code: 'verify_mismatch',
            error: { code: 'verify_mismatch', message: 'Audience mới không đúng loại mong đợi' },
          };
    } catch (err) {
      return { kind: 'failed' as const, code: 'verify_failed', error: scrub(err) };
    }
  });
  const ts = clock.now();
  if (outcome.kind === 'success') {
    await recordSuccess(ctx, account.id);
    const r = await finish('success', 'ok', {
      afterState: outcome.after,
      executedAt: ts,
      verifiedAt: ts,
    });
    if (a.requestedBy) {
      await notify(ctx, {
        kind: 'action_executed',
        recipients: { userIds: [a.requestedBy] },
        params: { action: a.actionType, item: a.params.name ?? a.targetMetaId },
        link: `/action-log/${a.id}`,
        dedupeKey: `action_executed:${a.id}`,
      });
    }
    return r;
  }
  await recordFailure(ctx, account.id, g.breakerFailures, clock);
  await notify(
    ctx,
    {
      kind: 'action_failed',
      recipients: { roles: ['owner'], userIds: a.requestedBy ? [a.requestedBy] : [] },
      params: { action: a.params.name ?? a.targetMetaId, reason: outcome.error.message },
      link: `/action-log/${a.id}`,
      dedupeKey: `action_failed:${a.id}`,
    },
    { enqueue: deps.enqueue },
  );
  return finish('failed', outcome.code, { errorMessage: outcome.error.message, executedAt: ts });
}
