import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '@adxlens/db';
import { AppError, compareDecimal, deltaPct, type ActorCtx, type WorkspaceCtx } from '@adxlens/core/shared';
import { assertCan } from '@adxlens/core/tenancy';

const { guardrailSettings } = schema;

/**
 * Guardrails mặc định (ADR-0001 A7 — "Thận trọng"). KHÓA BẰNG TEST (`guardrails.test.ts`); không đổi khi
 * không có task + ADR (CLAUDE.md quy tắc 6). Workspace chỉ được đặt chặt hơn.
 */
export const GUARDRAIL_DEFAULTS = Object.freeze({
  /** |thay đổi ngân sách| tối đa mỗi hành động, % (chuỗi thập phân). */
  maxBudgetChangePct: '15.00',
  /** Số hành động tối đa mỗi ngày trên một tài khoản QC (theo ngày của tài khoản). */
  maxActionsPerDay: 5,
  /** Số ngày có dữ liệu tối thiểu của đối tượng trước khi được thao tác. */
  minDataDays: 3,
  /** Không tự chạy (tier `auto`) từ 22:00 tới 06:00 giờ tài khoản. */
  quietStartHour: 22,
  quietEndHour: 6,
  /** Mở circuit breaker sau số lỗi liên tiếp trên một tài khoản. */
  breakerFailures: 3,
  excludeMetaIds: Object.freeze([] as string[]),
});

export type Guardrails = {
  maxBudgetChangePct: string;
  maxActionsPerDay: number;
  minDataDays: number;
  quietStartHour: number;
  quietEndHour: number;
  breakerFailures: number;
  excludeMetaIds: string[];
};

export const guardrailsInput = z.object({
  maxBudgetChangePct: z.string().regex(/^\d{1,3}(\.\d{1,2})?$/),
  maxActionsPerDay: z.number().int(),
  minDataDays: z.number().int(),
  quietStartHour: z.number().int().min(0).max(23),
  quietEndHour: z.number().int().min(0).max(23),
  breakerFailures: z.number().int(),
  excludeMetaIds: z.array(z.string().regex(/^\d{1,30}$/)).max(500),
});

/**
 * Chỉ cho phép chặt hơn mặc định: ngân sách ≤ 15% (> 0), số hành động 1–5, dữ liệu 3–30 ngày, khung giờ
 * yên lặng bắt đầu 12:00–22:00 và kết thúc 06:00–12:00 (luôn bao trùm 22:00–06:00), breaker 1–3 lỗi.
 */
export function tighterViolations(g: Guardrails): string[] {
  const d = GUARDRAIL_DEFAULTS;
  const out: string[] = [];
  if (
    compareDecimal(g.maxBudgetChangePct, '0') <= 0 ||
    compareDecimal(g.maxBudgetChangePct, d.maxBudgetChangePct) > 0
  ) {
    out.push('maxBudgetChangePct');
  }
  if (g.maxActionsPerDay < 1 || g.maxActionsPerDay > d.maxActionsPerDay) out.push('maxActionsPerDay');
  if (g.minDataDays < d.minDataDays || g.minDataDays > 30) out.push('minDataDays');
  if (g.quietStartHour < 12 || g.quietStartHour > d.quietStartHour) out.push('quietStartHour');
  if (g.quietEndHour < d.quietEndHour || g.quietEndHour > 12) out.push('quietEndHour');
  if (g.breakerFailures < 1 || g.breakerFailures > d.breakerFailures) out.push('breakerFailures');
  return out;
}

/** Guardrails hiệu lực của workspace (mặc định nếu chưa cấu hình). */
export async function effectiveGuardrails(ctx: WorkspaceCtx): Promise<Guardrails & { configured: boolean }> {
  const [r] = await ctx.db.select().from(guardrailSettings).where(eq(guardrailSettings.workspaceId, ctx.workspaceId));
  if (!r) return { ...GUARDRAIL_DEFAULTS, excludeMetaIds: [], configured: false };
  const g: Guardrails = {
    maxBudgetChangePct: r.maxBudgetChangePct,
    maxActionsPerDay: r.maxActionsPerDay,
    minDataDays: r.minDataDays,
    quietStartHour: r.quietStartHour,
    quietEndHour: r.quietEndHour,
    breakerFailures: r.breakerFailures,
    excludeMetaIds: r.excludeMetaIds,
  };
  // Phòng thủ: dòng DB bị sửa tay thành lỏng hơn → dùng mặc định cho trường đó.
  const bad = new Set(tighterViolations(g));
  const d = GUARDRAIL_DEFAULTS;
  return {
    maxBudgetChangePct: bad.has('maxBudgetChangePct') ? d.maxBudgetChangePct : g.maxBudgetChangePct,
    maxActionsPerDay: bad.has('maxActionsPerDay') ? d.maxActionsPerDay : g.maxActionsPerDay,
    minDataDays: bad.has('minDataDays') ? d.minDataDays : g.minDataDays,
    quietStartHour: bad.has('quietStartHour') ? d.quietStartHour : g.quietStartHour,
    quietEndHour: bad.has('quietEndHour') ? d.quietEndHour : g.quietEndHour,
    breakerFailures: bad.has('breakerFailures') ? d.breakerFailures : g.breakerFailures,
    excludeMetaIds: g.excludeMetaIds,
    configured: true,
  };
}

/** P205: lưu guardrails (Owner). Giá trị lỏng hơn mặc định bị từ chối, không có đường tắt. */
export async function saveGuardrails(ctx: ActorCtx, input: z.input<typeof guardrailsInput>): Promise<Guardrails> {
  assertCan(ctx.actor, 'guardrails.manage');
  const g = guardrailsInput.parse(input);
  const bad = tighterViolations(g);
  if (bad.length) throw new AppError('GUARDRAIL_VIOLATION', 'Chỉ được đặt chặt hơn mặc định', { fields: bad });
  const values = {
    ...g,
    excludeMetaIds: [...new Set(g.excludeMetaIds)],
    updatedBy: ctx.actor.userId,
    updatedAt: new Date(),
  };
  await ctx.db
    .insert(guardrailSettings)
    .values({ workspaceId: ctx.workspaceId, ...values })
    .onConflictDoUpdate({ target: guardrailSettings.workspaceId, set: values });
  return { ...g, excludeMetaIds: values.excludeMetaIds };
}

export const ACTION_TYPES = [
  'pause_ad',
  'resume_ad',
  'pause_adset',
  'resume_adset',
  'set_adset_budget',
  'duplicate_adset',
  // ADR-0023: tạo mới (chỉ duyệt tay).
  'create_ad',
  'create_lookalike',
  // ADR-0026: custom audience từ pixel / tương tác (chỉ duyệt tay).
  'create_custom_audience',
  // ADR-0026: nhóm QC mới, luôn PAUSED (chỉ duyệt tay).
  'create_adset',
  // ADR-0027: creative mới từ ảnh (chỉ duyệt tay).
  'create_creative',
  // ADR-0015: trạng thái chiến dịch (chỉ duyệt tay).
  'pause_campaign',
  'resume_campaign',
  // ADR-0025: đổi tên (chỉ duyệt tay).
  'rename_ad',
  'rename_adset',
  'rename_campaign',
  // ADR-0025: giá thầu nhóm QC, giới hạn chi chiến dịch (chỉ duyệt tay).
  'set_adset_bid',
  'set_campaign_spend_cap',
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

/** ADR-0025: hành động sửa thuộc tính (tên, giá thầu, giới hạn chi) — chỉ duyệt tay, rule không bao giờ tạo. */
export const EDIT_TYPES: ReadonlySet<ActionType> = new Set<ActionType>([
  'rename_ad',
  'rename_adset',
  'rename_campaign',
  'set_adset_bid',
  'set_campaign_spend_cap',
]);
/** ADR-0025: hành động đặt một giá trị tiền (đơn vị nhỏ nhất) → thuộc tính trên Meta. */
export const VALUE_FIELD: Partial<Record<ActionType, 'bid_amount' | 'spend_cap'>> = {
  set_adset_bid: 'bid_amount',
  set_campaign_spend_cap: 'spend_cap',
};
export const RENAME_TYPES: ReadonlySet<ActionType> = new Set<ActionType>([
  'rename_ad',
  'rename_adset',
  'rename_campaign',
]);

export type GuardrailViolation = { code: string; params?: Record<string, string | number> };

function localHour(now: Date, timeZone: string): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(now));
}

export function inQuietHours(hour: number, start: number, end: number): boolean {
  return start > end ? hour >= start || hour < end : hour >= start && hour < end;
}

/**
 * Kiểm guardrails cho một hành động (ADR-0008 bước 5). Trả danh sách vi phạm; rỗng = được phép. Thuần hàm,
 * gateway nạp dữ liệu (số hành động hôm nay, số ngày dữ liệu, ngân sách hiện tại trên Meta).
 */
export function checkGuardrails(input: {
  guardrails: Guardrails;
  actionType: ActionType;
  tier: 'approve' | 'auto';
  /** Đối tượng và các cấp cha (ad set, campaign) để so danh sách loại trừ. */
  targetIds: string[];
  accountTimezone: string;
  now: Date;
  actionsToday: number;
  dataDays: number;
  currentDailyBudget?: string | null;
  newDailyBudget?: string | null;
  /** ADR-0025: giá trị hiện tại / mới của giá thầu hoặc giới hạn chi (đơn vị nhỏ nhất). */
  currentValue?: string | null;
  newValue?: string | null;
}): GuardrailViolation[] {
  const g = input.guardrails;
  const v: GuardrailViolation[] = [];
  if (input.targetIds.some((id) => g.excludeMetaIds.includes(id))) v.push({ code: 'excluded' });
  if (input.actionsToday >= g.maxActionsPerDay)
    v.push({ code: 'too_many_actions', params: { max: g.maxActionsPerDay } });
  if (input.dataDays < g.minDataDays) v.push({ code: 'not_enough_data', params: { min: g.minDataDays } });
  if (input.tier === 'auto') {
    if (inQuietHours(localHour(input.now, input.accountTimezone), g.quietStartHour, g.quietEndHour)) {
      v.push({ code: 'quiet_hours', params: { start: g.quietStartHour, end: g.quietEndHour } });
    }
    // PRD 11.2.6 / ADR-0009, ADR-0011: không tự bật lại, không tự nhân bản.
    if (input.actionType === 'resume_ad' || input.actionType === 'resume_adset') v.push({ code: 'no_auto_resume' });
    if (input.actionType === 'duplicate_adset') v.push({ code: 'no_auto_duplicate' });
    // ADR-0023: tạo quảng cáo / audience không bao giờ tự chạy.
    if (
      input.actionType === 'create_ad' ||
      input.actionType === 'create_lookalike' ||
      input.actionType === 'create_custom_audience' ||
      input.actionType === 'create_adset' ||
      input.actionType === 'create_creative'
    ) {
      v.push({ code: 'no_auto_create' });
    }
    // ADR-0015: rule không bao giờ tạm dừng / bật lại cả chiến dịch.
    if (input.actionType === 'pause_campaign' || input.actionType === 'resume_campaign') {
      v.push({ code: 'no_auto_campaign' });
    }
    if (EDIT_TYPES.has(input.actionType)) v.push({ code: 'no_auto_edit' });
  }
  if (input.actionType === 'set_adset_budget') {
    const cur = input.currentDailyBudget;
    const next = input.newDailyBudget;
    if (!cur || compareDecimal(cur, '0') <= 0) v.push({ code: 'no_daily_budget' });
    else if (!next || compareDecimal(next, '0') <= 0) v.push({ code: 'invalid_budget' });
    else if (compareDecimal(deltaPct(next, cur), g.maxBudgetChangePct) > 0) {
      v.push({ code: 'budget_change_too_large', params: { max: g.maxBudgetChangePct } });
    }
  }
  // ADR-0026: nhóm QC mới — ngân sách ngày ≤ ngân sách nhóm QC mẫu × (1 + ngưỡng).
  if (input.actionType === 'create_adset' && input.currentDailyBudget && input.newDailyBudget) {
    const cur = input.currentDailyBudget;
    const next = input.newDailyBudget;
    if (compareDecimal(next, '0') <= 0) v.push({ code: 'invalid_budget' });
    else if (compareDecimal(next, cur) > 0 && compareDecimal(deltaPct(next, cur), g.maxBudgetChangePct) > 0) {
      v.push({ code: 'new_adset_budget_too_large', params: { max: g.maxBudgetChangePct } });
    }
  }
  // ADR-0025: giá thầu — chỉ nhóm QC đang có giá thầu; |thay đổi| ≤ ngưỡng ngân sách.
  if (input.actionType === 'set_adset_bid') {
    const cur = input.currentValue;
    const next = input.newValue;
    if (!cur || compareDecimal(cur, '0') <= 0) v.push({ code: 'no_bid_amount' });
    else if (!next || compareDecimal(next, '0') <= 0) v.push({ code: 'invalid_bid' });
    else if (compareDecimal(deltaPct(next, cur), g.maxBudgetChangePct) > 0) {
      v.push({ code: 'bid_change_too_large', params: { max: g.maxBudgetChangePct } });
    }
  }
  // ADR-0025: giới hạn chi — hạ / đặt mới luôn được (thêm phanh); nâng ≤ ngưỡng ngân sách; không gỡ.
  if (input.actionType === 'set_campaign_spend_cap') {
    const cur = input.currentValue;
    const next = input.newValue;
    if (!next || compareDecimal(next, '0') <= 0) v.push({ code: 'invalid_spend_cap' });
    else if (
      cur &&
      compareDecimal(cur, '0') > 0 &&
      compareDecimal(next, cur) > 0 &&
      compareDecimal(deltaPct(next, cur), g.maxBudgetChangePct) > 0
    ) {
      v.push({ code: 'spend_cap_change_too_large', params: { max: g.maxBudgetChangePct } });
    }
  }
  return v;
}
