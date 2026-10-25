import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '@adxlens/db';
import type { Enqueue } from '@adxlens/jobs';
import { hasPlanEntitlement } from '@adxlens/core/billing';
import { listAdAccounts } from '@adxlens/core/connections';
import { isEnabled } from '@adxlens/core/flags';
import {
  addDays,
  AppError,
  compareDecimal,
  divDecimal,
  localDate,
  systemClock,
  type ActorCtx,
  type Clock,
  type WorkspaceCtx,
} from '@adxlens/core/shared';
import { assertCan } from '@adxlens/core/tenancy';
import { minorUnits, requestAutoAction } from './gateway';
import { nextLocalHour, scheduleRevert } from './reverts';
import { checkGuardrails, effectiveGuardrails, GUARDRAIL_DEFAULTS, inQuietHours, type ActionType } from './guardrails';

const { automationRules, ruleEvaluations, recommendations } = schema;

export const RULE_METRICS = [
  'spend',
  'results',
  'cpa',
  'ctr',
  'frequency',
  'ctr_change_pct',
  'cpa_change_pct',
  // ADR-0021: 7 ngày + 1 ngày (hôm qua) cho Stop-loss / Surf.
  'link_clicks',
  'roas',
  'spend_1d',
  'results_1d',
  'link_clicks_1d',
  'cpa_1d',
  'roas_1d',
] as const;
export type RuleMetric = (typeof RULE_METRICS)[number];
/** Số ngày shadow tối thiểu trước khi bật live (ADR-0012, L3 18). */
export const SHADOW_MIN_DAYS = 14;
export const BACKTEST_DAYS = 30;

const decimal = z.string().regex(/^-?\d{1,14}(\.\d{1,6})?$/);
export const ruleConditionSchema = z.object({
  metric: z.enum(RULE_METRICS),
  op: z.enum(['gte', 'lte']),
  value: decimal,
});
/** Giờ hẹn (giờ tài khoản) — phải ngoài giờ yên tĩnh của workspace (kiểm ở validateRule). */
const revertSchema = z.object({
  kind: z.enum(['restore_budget', 'suggest_undo']),
  hour: z.number().int().min(0).max(23),
});
export const ruleActionSchema = z.object({
  /** `suggest_resume` (Revive, ADR-0021): chỉ đề xuất bật lại — không ghi Meta (guardrail `no_auto_resume`). */
  type: z.enum(['pause_ad', 'pause_adset', 'set_adset_budget', 'suggest_resume']),
  changePct: decimal.optional(),
  maxDailyBudget: z
    .string()
    .regex(/^\d{1,14}$/)
    .optional(),
  /** Sunsetting: ngân sách ngày không giảm dưới sàn này (đơn vị nhỏ nhất). */
  floorDailyBudget: z
    .string()
    .regex(/^\d{1,14}$/)
    .optional(),
  revert: revertSchema.optional(),
});
export const ruleInputSchema = z.object({
  adAccountId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  templateKey: z.string().max(60).nullish(),
  level: z.enum(['ad', 'adset']),
  /** ADR-0014: 'all' (VÀ, mặc định) hoặc 'any' (HOẶC). */
  match: z.enum(['all', 'any']).default('all'),
  condition: z.array(ruleConditionSchema).min(1).max(6),
  action: ruleActionSchema,
  guardrails: z
    .object({
      maxActionsPerDay: z.number().int().min(1).optional(),
      excludeMetaIds: z
        .array(z.string().regex(/^\d{1,30}$/))
        .max(500)
        .optional(),
      /** ADR-0021: khoảng cách tối thiểu giữa 2 lần rule thao tác cùng đối tượng; chỉ được ≥ 24 giờ (chặt hơn). */
      cooldownHours: z.number().int().min(24).max(720).optional(),
    })
    .default({}),
});
export type RuleInput = z.input<typeof ruleInputSchema>;
export type RuleRow = typeof automationRules.$inferSelect;

/** Mẫu dựng sẵn từ gợi ý P1 (P2-10), sắp theo số gợi ý loại đó đã được làm. */
export const RULE_TEMPLATES: (Omit<
  z.output<typeof ruleInputSchema>,
  'adAccountId' | 'name' | 'guardrails' | 'match'
> & {
  key: string;
  sourceKey: string;
  match?: 'all' | 'any';
  /** Mẫu tăng ngân sách: người dùng phải nhập trần ngân sách ngày (ADR-0012 mục 2, ADR-0014). */
  requiresMaxDailyBudget?: boolean;
  /** Sunsetting (ADR-0021): bắt buộc sàn ngân sách. */
  requiresFloorDailyBudget?: boolean;
  /** Tactic Madgicx (ADR-0021): nhóm riêng trong thư viện mẫu. */
  tactic?: boolean;
})[] = [
  {
    key: 'pause_fatigued_ad',
    sourceKey: 'creative_fatigue',
    templateKey: 'pause_fatigued_ad',
    level: 'ad',
    condition: [
      { metric: 'ctr_change_pct', op: 'lte', value: '-25' },
      { metric: 'frequency', op: 'gte', value: '2.5' },
    ],
    action: { type: 'pause_ad' },
  },
  {
    key: 'pause_adset_no_results',
    sourceKey: 'spend_no_conversion',
    templateKey: 'pause_adset_no_results',
    level: 'adset',
    condition: [
      { metric: 'spend', op: 'gte', value: '1000000' },
      { metric: 'results', op: 'lte', value: '0' },
    ],
    action: { type: 'pause_adset' },
  },
  {
    key: 'reduce_budget_high_cpa',
    sourceKey: 'budget_misallocation',
    templateKey: 'reduce_budget_high_cpa',
    level: 'adset',
    condition: [
      { metric: 'cpa_change_pct', op: 'gte', value: '50' },
      { metric: 'results', op: 'gte', value: '5' },
    ],
    action: { type: 'set_adset_budget', changePct: '-15' },
  },
  {
    // ADR-0014: ad set thắng (CPA giảm mạnh, đủ kết quả) → +15% (mức tối đa ADR-0010), không vượt trần người dùng đặt.
    key: 'increase_budget_winner',
    sourceKey: 'starved_winner',
    templateKey: 'increase_budget_winner',
    level: 'adset',
    condition: [
      { metric: 'cpa_change_pct', op: 'lte', value: '-20' },
      { metric: 'results', op: 'gte', value: '10' },
    ],
    action: { type: 'set_adset_budget', changePct: '15' },
    requiresMaxDailyBudget: true,
  },
  // ADR-0021 — tactic kiểu Madgicx. Dữ liệu theo ngày: "trong ngày" = ngày dữ liệu gần nhất (hôm qua).
  {
    // Stop-loss: chi đáng kể hôm qua mà 0 click → tạm dừng; sáng hôm sau đề xuất bật lại (không tự bật lại).
    key: 'stop_loss_no_clicks',
    sourceKey: 'tactic_stop_loss',
    templateKey: 'stop_loss_no_clicks',
    level: 'ad',
    condition: [
      { metric: 'spend_1d', op: 'gte', value: '200000' },
      { metric: 'link_clicks_1d', op: 'lte', value: '0' },
    ],
    action: { type: 'pause_ad', revert: { kind: 'suggest_undo', hour: 7 } },
    tactic: true,
  },
  {
    // Surf: hôm qua và 7 ngày đều sinh lời → +15% (trần bắt buộc), tự trả ngân sách cũ lúc 21:00.
    key: 'surf_winner',
    sourceKey: 'tactic_surf',
    templateKey: 'surf_winner',
    level: 'adset',
    condition: [
      { metric: 'roas_1d', op: 'gte', value: '2' },
      { metric: 'roas', op: 'gte', value: '1.5' },
    ],
    action: { type: 'set_adset_budget', changePct: '15', revert: { kind: 'restore_budget', hour: 21 } },
    requiresMaxDailyBudget: true,
    tactic: true,
  },
  {
    // Sunsetting: CPA tăng mạnh → −15% mỗi lần, cách nhau ≥ 48 giờ, không dưới sàn.
    key: 'sunset_loser',
    sourceKey: 'tactic_sunset',
    templateKey: 'sunset_loser',
    level: 'adset',
    condition: [
      { metric: 'cpa_change_pct', op: 'gte', value: '30' },
      { metric: 'results', op: 'gte', value: '3' },
    ],
    action: { type: 'set_adset_budget', changePct: '-15' },
    requiresFloorDailyBudget: true,
    tactic: true,
  },
  {
    // Revive: quảng cáo do rule dừng trong 7 ngày nhưng 7 ngày qua vẫn có CPA tốt → đề xuất bật lại.
    key: 'revive_paused',
    sourceKey: 'tactic_revive',
    templateKey: 'revive_paused',
    level: 'ad',
    condition: [
      { metric: 'results', op: 'gte', value: '2' },
      { metric: 'cpa', op: 'lte', value: '100000' },
    ],
    action: { type: 'suggest_resume' },
    tactic: true,
  },
];

/** Cooldown mặc định của Sunsetting (ADR-0021). */
export const SUNSET_COOLDOWN_HOURS = 48;

export async function listRuleTemplates(ctx: ActorCtx) {
  const rows = await ctx.db
    .select({ sourceKey: recommendations.sourceKey, n: sql<number>`count(*)::int` })
    .from(recommendations)
    .where(and(eq(recommendations.workspaceId, ctx.workspaceId), eq(recommendations.status, 'done')))
    .groupBy(recommendations.sourceKey);
  const done = new Map(rows.map((r) => [r.sourceKey, r.n]));
  return RULE_TEMPLATES.map((t) => ({ ...t, doneCount: done.get(t.sourceKey) ?? 0 })).sort(
    (a, b) => b.doneCount - a.doneCount,
  );
}

/** Hợp lệ ngữ nghĩa (ADR-0012): cấp khớp hành động, ±15%, tăng ngân sách phải có trần, guardrails chặt hơn. */
async function validateRule(ctx: WorkspaceCtx, r: z.output<typeof ruleInputSchema>) {
  if (r.action.type === 'pause_ad' && r.level !== 'ad')
    throw new AppError('VALIDATION_FAILED', 'Tạm dừng ad cần cấp ad');
  if (r.action.type !== 'pause_ad' && r.action.type !== 'suggest_resume' && r.level !== 'adset')
    throw new AppError('VALIDATION_FAILED', 'Hành động này cần cấp ad set');
  // ADR-0021: hẹn giờ chỉ đi với đúng loại hành động; giờ hẹn ngoài giờ yên tĩnh.
  const rv = r.action.revert;
  if (rv) {
    const okKind =
      (rv.kind === 'restore_budget' &&
        r.action.type === 'set_adset_budget' &&
        compareDecimal(r.action.changePct ?? '0', '0') > 0) ||
      (rv.kind === 'suggest_undo' && (r.action.type === 'pause_ad' || r.action.type === 'pause_adset'));
    if (!okKind) throw new AppError('VALIDATION_FAILED', 'Hẹn giờ không hợp với hành động', { fields: ['revert'] });
    const g0 = await effectiveGuardrails(ctx);
    if (inQuietHours(rv.hour, g0.quietStartHour, g0.quietEndHour)) {
      throw new AppError('GUARDRAIL_VIOLATION', 'Giờ hẹn nằm trong giờ yên tĩnh', { fields: ['revert'] });
    }
  }
  if (
    r.action.floorDailyBudget &&
    !(r.action.type === 'set_adset_budget' && compareDecimal(r.action.changePct ?? '0', '0') < 0)
  ) {
    throw new AppError('VALIDATION_FAILED', 'Sàn ngân sách chỉ dùng khi giảm ngân sách', {
      fields: ['floorDailyBudget'],
    });
  }
  const tpl = RULE_TEMPLATES.find((t) => t.key === r.templateKey);
  if (tpl?.requiresFloorDailyBudget && !r.action.floorDailyBudget) {
    throw new AppError('VALIDATION_FAILED', 'Cần sàn ngân sách ngày', { fields: ['floorDailyBudget'] });
  }
  if (r.action.type === 'suggest_resume' && (r.action.changePct || r.action.maxDailyBudget || rv)) {
    throw new AppError('VALIDATION_FAILED', 'Đề xuất bật lại không có tham số ngân sách / hẹn giờ');
  }
  if (r.action.type === 'set_adset_budget') {
    const pct = r.action.changePct;
    if (!pct || compareDecimal(pct, '0') === 0) throw new AppError('VALIDATION_FAILED', 'Cần mức thay đổi ngân sách');
    const abs = pct.startsWith('-') ? pct.slice(1) : pct;
    if (compareDecimal(abs, GUARDRAIL_DEFAULTS.maxBudgetChangePct) > 0) {
      throw new AppError('GUARDRAIL_VIOLATION', 'Thay đổi ngân sách vượt guardrails', { fields: ['changePct'] });
    }
    if (compareDecimal(pct, '0') > 0 && !r.action.maxDailyBudget) {
      throw new AppError('VALIDATION_FAILED', 'Tăng ngân sách cần đặt trần ngân sách ngày');
    }
  }
  const g = await effectiveGuardrails(ctx);
  if (r.guardrails.maxActionsPerDay && r.guardrails.maxActionsPerDay > g.maxActionsPerDay) {
    throw new AppError('GUARDRAIL_VIOLATION', 'Chỉ được chặt hơn guardrails của workspace', {
      fields: ['maxActionsPerDay'],
    });
  }
}

/** P212: tạo rule — luôn ở chế độ shadow. */
export async function createRule(ctx: ActorCtx, input: RuleInput, clock: Clock = systemClock): Promise<RuleRow> {
  assertCan(ctx.actor, 'automation.manage');
  const r = ruleInputSchema.parse(input);
  if (!(await listAdAccounts(ctx)).some((a) => a.id === r.adAccountId))
    throw new AppError('NOT_FOUND', 'Không tìm thấy tài khoản');
  await validateRule(ctx, r);
  const [row] = await ctx.db
    .insert(automationRules)
    .values({
      workspaceId: ctx.workspaceId,
      adAccountId: r.adAccountId,
      name: r.name,
      templateKey: r.templateKey ?? null,
      level: r.level,
      match: r.match,
      condition: r.condition,
      action: r.action,
      guardrails: r.guardrails,
      mode: 'shadow',
      shadowStartedAt: clock.now(),
      createdBy: ctx.actor.userId,
    })
    .returning();
  return row!;
}

export async function getRule(ctx: ActorCtx, id: string): Promise<RuleRow> {
  const [r] = await ctx.db
    .select()
    .from(automationRules)
    .where(and(eq(automationRules.workspaceId, ctx.workspaceId), eq(automationRules.id, id)));
  if (!r || !(await listAdAccounts(ctx)).some((a) => a.id === r.adAccountId))
    throw new AppError('NOT_FOUND', 'Không tìm thấy rule');
  return r;
}

export async function listRules(ctx: ActorCtx, opts: { clientId?: string } = {}) {
  const accounts = await listAdAccounts(ctx, { clientId: opts.clientId });
  if (!accounts.length) return [];
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const rows = await ctx.db
    .select()
    .from(automationRules)
    .where(
      and(eq(automationRules.workspaceId, ctx.workspaceId), inArray(automationRules.adAccountId, [...byId.keys()])),
    )
    .orderBy(desc(automationRules.createdAt));
  return rows.map((r) => ({
    ...r,
    accountName: byId.get(r.adAccountId)!.name,
    currency: byId.get(r.adAccountId)!.currency,
  }));
}

/** Điều kiện để bật live (ADR-0012 mục 4). Trả lý do chặn hoặc null. */
export async function liveBlocker(
  ctx: WorkspaceCtx,
  rule: RuleRow,
  clock: Clock = systemClock,
): Promise<string | null> {
  if (!(await isEnabled(ctx, 'p2b_auto'))) return 'feature_disabled';
  if (!(await hasPlanEntitlement(ctx, 'write_actions'))) return 'plan_required';
  const started = rule.shadowStartedAt;
  if (!started || clock.now().getTime() - started.getTime() < SHADOW_MIN_DAYS * 86_400_000) return 'shadow_too_short';
  return null;
}

/** P211: đổi chế độ. `live` chỉ khi đủ điều kiện; quay về `shadow` đặt lại mốc 14 ngày. */
export async function setRuleMode(
  ctx: ActorCtx,
  id: string,
  mode: (typeof schema.RULE_MODES)[number],
  clock: Clock = systemClock,
): Promise<RuleRow> {
  assertCan(ctx.actor, 'automation.manage');
  const rule = await getRule(ctx, id);
  const now = clock.now();
  if (mode === 'live') {
    const block = await liveBlocker(ctx, rule, clock);
    if (block) throw new AppError('CONFLICT', 'Chưa bật live được', { reason: block });
  }
  const set: Partial<typeof automationRules.$inferInsert> = { mode, updatedAt: now };
  if (mode === 'live') set.liveSince = now;
  if (mode === 'shadow' && rule.mode !== 'shadow') set.shadowStartedAt = now;
  const [row] = await ctx.db
    .update(automationRules)
    .set(set)
    .where(and(eq(automationRules.workspaceId, ctx.workspaceId), eq(automationRules.id, id)))
    .returning();
  return row!;
}

export async function deleteRule(ctx: ActorCtx, id: string): Promise<void> {
  assertCan(ctx.actor, 'automation.manage');
  await getRule(ctx, id);
  await ctx.db
    .delete(automationRules)
    .where(and(eq(automationRules.workspaceId, ctx.workspaceId), eq(automationRules.id, id)));
}

export type EntityMetrics = {
  metaId: string;
  name: string | null;
  status: string | null;
  dailyBudget: string | null;
  parent: string | null;
  metrics: Record<RuleMetric, string | null>;
};

/** Chỉ số 7 ngày tới `asOf` (và 7 ngày trước đó) theo cấp, đọc snapshot — không gọi Meta. */
export async function entityMetrics(
  ctx: WorkspaceCtx,
  adAccountId: string,
  level: 'ad' | 'adset',
  asOf: string,
): Promise<EntityMetrics[]> {
  const key = sql.raw(level === 'ad' ? 'i.meta_id' : 'i.adset_id');
  const curFrom = addDays(asOf, -6);
  const prevFrom = addDays(asOf, -13);
  const prevTo = addDays(asOf, -7);
  const rows = await ctx.db.execute<{
    meta_id: string;
    name: string | null;
    status: string | null;
    daily_budget: string | null;
    parent: string | null;
    spend: string | null;
    impressions: string | null;
    link_clicks: string | null;
    results: string | null;
    freq_w: string | null;
    p_spend: string | null;
    p_impressions: string | null;
    p_link_clicks: string | null;
    p_results: string | null;
    value: string | null;
    spend_1d: string | null;
    results_1d: string | null;
    link_clicks_1d: string | null;
    value_1d: string | null;
  }>(sql`
    with w as (
      select ${key} as k,
        sum(i.spend) filter (where i.date between ${curFrom} and ${asOf}) as spend,
        sum(i.impressions) filter (where i.date between ${curFrom} and ${asOf}) as impressions,
        sum(i.link_clicks) filter (where i.date between ${curFrom} and ${asOf}) as link_clicks,
        sum(i.results) filter (where i.date between ${curFrom} and ${asOf}) as results,
        sum(coalesce(i.frequency, 0) * i.impressions) filter (where i.date between ${curFrom} and ${asOf}) as freq_w,
        sum(i.spend) filter (where i.date between ${prevFrom} and ${prevTo}) as p_spend,
        sum(i.impressions) filter (where i.date between ${prevFrom} and ${prevTo}) as p_impressions,
        sum(i.link_clicks) filter (where i.date between ${prevFrom} and ${prevTo}) as p_link_clicks,
        sum(i.results) filter (where i.date between ${prevFrom} and ${prevTo}) as p_results,
        sum(i.conversion_value) filter (where i.date between ${curFrom} and ${asOf}) as value,
        sum(i.spend) filter (where i.date = ${asOf}) as spend_1d,
        sum(i.results) filter (where i.date = ${asOf}) as results_1d,
        sum(i.link_clicks) filter (where i.date = ${asOf}) as link_clicks_1d,
        sum(i.conversion_value) filter (where i.date = ${asOf}) as value_1d
      from analytics.insights_daily i
      where i.workspace_id = ${ctx.workspaceId} and i.ad_account_id = ${adAccountId} and i.entity_type = 'ad'
        and i.date between ${prevFrom} and ${asOf} and ${key} is not null
      group by ${key}
    )
    select e.meta_id, e.name, e.status, e.daily_budget::text as daily_budget, e.parent_meta_id as parent,
      w.spend::text as spend, w.impressions::text as impressions, w.link_clicks::text as link_clicks,
      w.results::text as results, w.freq_w::text as freq_w, w.p_spend::text as p_spend,
      w.p_impressions::text as p_impressions, w.p_link_clicks::text as p_link_clicks, w.p_results::text as p_results,
      w.value::text as value, w.spend_1d::text as spend_1d, w.results_1d::text as results_1d,
      w.link_clicks_1d::text as link_clicks_1d, w.value_1d::text as value_1d
    from analytics.entities e join w on w.k = e.meta_id
    where e.workspace_id = ${ctx.workspaceId} and e.ad_account_id = ${adAccountId} and e.entity_type = ${level}`);
  const ratio = (a: string | null, b: string | null, scale = 6) =>
    a !== null && b !== null && compareDecimal(b, '0') > 0 ? divDecimal(a, b, scale) : null;
  const change = (cur: string | null, prev: string | null) => {
    if (cur === null || prev === null || compareDecimal(prev, '0') <= 0) return null;
    // (cur − prev) / prev × 100, tính bằng tỷ lệ thập phân.
    const r = divDecimal(cur, prev, 6)!;
    return ((Number(r) - 1) * 100).toFixed(2); // tỷ lệ % hiển thị, không phải tiền
  };
  return rows.map((r) => {
    const ctr = ratio(r.link_clicks ?? '0', r.impressions);
    const pCtr = ratio(r.p_link_clicks ?? '0', r.p_impressions);
    const cpa = ratio(r.spend ?? '0', r.results, 4);
    const pCpa = ratio(r.p_spend ?? '0', r.p_results, 4);
    return {
      metaId: r.meta_id,
      name: r.name,
      status: r.status,
      dailyBudget: minorUnits(r.daily_budget),
      parent: r.parent,
      metrics: {
        spend: r.spend ?? '0',
        results: r.results ?? '0',
        cpa,
        ctr,
        frequency: ratio(r.freq_w ?? '0', r.impressions, 4),
        ctr_change_pct: change(ctr, pCtr),
        cpa_change_pct: change(cpa, pCpa),
        link_clicks: r.link_clicks ?? '0',
        roas: ratio(r.value ?? '0', r.spend, 4),
        spend_1d: r.spend_1d ?? '0',
        results_1d: r.results_1d ?? '0',
        link_clicks_1d: r.link_clicks_1d ?? '0',
        cpa_1d: ratio(r.spend_1d ?? '0', r.results_1d, 4),
        roas_1d: ratio(r.value_1d ?? '0', r.spend_1d, 4),
      },
    };
  });
}

/** Khớp điều kiện (VÀ). Chỉ số không tính được (null) → không khớp. Chỉ đối tượng đang chạy. */
export function matchConditions(
  conditions: { metric: string; op: string; value: string }[],
  e: Pick<EntityMetrics, 'metrics' | 'status'>,
  match: 'all' | 'any' = 'all',
  /** Revive (ADR-0021) xét đối tượng đang tạm dừng; mọi rule khác chỉ xét đối tượng đang chạy. */
  status: 'ACTIVE' | 'PAUSED' = 'ACTIVE',
): boolean {
  if (e.status !== status) return false;
  // Chỉ số thiếu dữ liệu (null) không bao giờ làm điều kiện đúng — kể cả với "HOẶC" (ADR-0014).
  const ok = (c: { metric: string; op: string; value: string }) => {
    const v = e.metrics[c.metric as RuleMetric];
    if (v === null || v === undefined) return false;
    const cmp = compareDecimal(v, c.value);
    return c.op === 'gte' ? cmp >= 0 : cmp <= 0;
  };
  return match === 'any' ? conditions.some(ok) : conditions.every(ok);
}

/** Ngân sách mới cho rule: hiện tại × (1 + %), làm tròn xuống, không vượt trần người dùng đặt. */
export function ruleBudget(current: string | null, changePct: string, maxDailyBudget?: string | null): string | null {
  if (!current) return null;
  const pct = Math.round(Number(changePct) * 100); // phần trăm × 100 (số nguyên)
  let next = (BigInt(current) * BigInt(10_000 + pct)) / 10_000n;
  if (maxDailyBudget && next > BigInt(maxDailyBudget)) next = BigInt(maxDailyBudget);
  return next.toString();
}

export type WouldDo = {
  metaId: string;
  name: string | null;
  actionType: ActionType;
  newDailyBudget: string | null;
  /** Revive: chỉ đề xuất bật lại, không tạo hành động ghi Meta. */
  suggestOnly?: boolean;
};

const statusFor = (r: { action: { type: string } }) => (r.action.type === 'suggest_resume' ? 'PAUSED' : 'ACTIVE');

function plan(rule: Pick<RuleRow, 'action' | 'level'>, matched: EntityMetrics[]): WouldDo[] {
  const out: WouldDo[] = [];
  for (const e of matched) {
    if (rule.action.type === 'suggest_resume') {
      out.push({
        metaId: e.metaId,
        name: e.name,
        actionType: rule.level === 'ad' ? 'resume_ad' : 'resume_adset',
        newDailyBudget: null,
        suggestOnly: true,
      });
      continue;
    }
    let newDailyBudget =
      rule.action.type === 'set_adset_budget'
        ? ruleBudget(e.dailyBudget, rule.action.changePct ?? '0', rule.action.maxDailyBudget)
        : null;
    // Sunsetting (ADR-0021): không giảm dưới sàn; đã ở / dưới sàn → bỏ qua đối tượng.
    const floor = rule.action.floorDailyBudget;
    if (floor && newDailyBudget !== null) {
      if (e.dailyBudget !== null && BigInt(e.dailyBudget) <= BigInt(floor)) continue;
      if (BigInt(newDailyBudget) < BigInt(floor)) newDailyBudget = floor;
    }
    out.push({ metaId: e.metaId, name: e.name, actionType: rule.action.type as ActionType, newDailyBudget });
  }
  return out;
}

/**
 * Revive (ADR-0021): đối tượng do RULE tạm dừng (hành động auto thành công) trong 7 ngày → id hành động tạm dừng gần
 * nhất. Đối tượng người dùng tự dừng không bao giờ có trong danh sách (PRD 11.2.6).
 */
export async function rulePausedTargets(
  ctx: WorkspaceCtx,
  adAccountId: string,
  level: 'ad' | 'adset',
  now: Date,
): Promise<Map<string, string>> {
  const rows = await ctx.db
    .select({ id: schema.actions.id, metaId: schema.actions.targetMetaId, at: schema.actions.createdAt })
    .from(schema.actions)
    .where(
      and(
        eq(schema.actions.workspaceId, ctx.workspaceId),
        eq(schema.actions.adAccountId, adAccountId),
        eq(schema.actions.tier, 'auto'),
        eq(schema.actions.status, 'success'),
        eq(schema.actions.actionType, level === 'ad' ? 'pause_ad' : 'pause_adset'),
        gte(schema.actions.createdAt, new Date(now.getTime() - 7 * 86_400_000)),
      ),
    )
    .orderBy(desc(schema.actions.createdAt));
  const out = new Map<string, string>();
  for (const r of rows) if (!out.has(r.metaId)) out.set(r.metaId, r.id);
  return out;
}

/**
 * P213 Backtest (P2-11): chạy điều kiện trên snapshot từng ngày trong 30 ngày qua; mỗi đối tượng chỉ một lần
 * trong 24 giờ. Trả "sẽ làm gì vào ngày nào" — không gọi Meta.
 */
export async function backtestRule(
  ctx: ActorCtx,
  input: RuleInput,
  clock: Clock = systemClock,
): Promise<{ days: number; items: (WouldDo & { date: string })[] }> {
  assertCan(ctx.actor, 'automation.manage');
  const r = ruleInputSchema.parse(input);
  const account = (await listAdAccounts(ctx)).find((a) => a.id === r.adAccountId);
  if (!account) throw new AppError('NOT_FOUND', 'Không tìm thấy tài khoản');
  await validateRule(ctx, r);
  const end = addDays(localDate(clock.now(), account.timezone), -1);
  const items: (WouldDo & { date: string })[] = [];
  const last = new Map<string, string>();
  for (let i = BACKTEST_DAYS - 1; i >= 0; i--) {
    const d = addDays(end, -i);
    const m = (await entityMetrics(ctx, r.adAccountId, r.level, d)).filter(
      (e) =>
        matchConditions(r.condition, e, r.match, statusFor(r)) &&
        !(r.guardrails.excludeMetaIds ?? []).includes(e.metaId),
    );
    for (const w of plan(r, m)) {
      const prev = last.get(w.metaId);
      if (prev && prev >= addDays(d, -1)) continue;
      last.set(w.metaId, d);
      items.push({ ...w, date: d });
    }
  }
  return { days: BACKTEST_DAYS, items };
}

/**
 * Đánh giá một rule tại ngày `asOf` (ngày dữ liệu gần nhất theo múi giờ tài khoản): khớp đối tượng, kế hoạch
 * hành động kèm lý do guardrails sẽ chặn (tier auto). Dùng cho shadow (ghi `would_do`) và live (041).
 */
export async function evaluateRule(ctx: WorkspaceCtx, rule: RuleRow, clock: Clock = systemClock) {
  const [account] = await ctx.db
    .select({ timezone: schema.adAccounts.timezone })
    .from(schema.adAccounts)
    .where(and(eq(schema.adAccounts.workspaceId, ctx.workspaceId), eq(schema.adAccounts.id, rule.adAccountId)));
  if (!account) return null;
  const now = clock.now();
  const asOf = addDays(localDate(now, account.timezone), -1);
  const metrics = await entityMetrics(ctx, rule.adAccountId, rule.level, asOf);
  const g = await effectiveGuardrails(ctx);
  const exclude = [...g.excludeMetaIds, ...(rule.guardrails.excludeMetaIds ?? [])];
  let matched = metrics.filter((e) => matchConditions(rule.condition, e, rule.match, statusFor(rule)));
  const paused =
    rule.action.type === 'suggest_resume' ? await rulePausedTargets(ctx, rule.adAccountId, rule.level, now) : null;
  if (paused) matched = matched.filter((e) => paused.has(e.metaId));
  const wouldDo = plan(rule, matched).map((w) => {
    const e = matched.find((x) => x.metaId === w.metaId)!;
    // Đề xuất bật lại không ghi Meta → không qua guardrails ghi; bị chặn bởi loại trừ như mọi rule.
    if (w.suggestOnly) {
      return { ...w, blockedBy: exclude.includes(w.metaId) ? 'excluded' : null, pauseActionId: paused?.get(w.metaId) };
    }
    const v = checkGuardrails({
      guardrails: {
        ...g,
        excludeMetaIds: exclude,
        maxActionsPerDay: Math.min(g.maxActionsPerDay, rule.guardrails.maxActionsPerDay ?? Infinity),
      },
      actionType: w.actionType,
      tier: 'auto',
      targetIds: [w.metaId, e.parent].filter((x): x is string => !!x),
      accountTimezone: account.timezone,
      now,
      actionsToday: 0,
      dataDays: 7,
      currentDailyBudget: e.dailyBudget,
      newDailyBudget: w.newDailyBudget,
    });
    return { ...w, blockedBy: v.length ? v.map((x) => x.code).join(',') : null, pauseActionId: undefined };
  });
  return {
    asOf,
    matched: matched.map((e) => ({ metaId: e.metaId, name: e.name, metrics: e.metrics })),
    wouldDo,
    timezone: account.timezone,
  };
}

/** Shadow mode (P2-13): ghi `would_do` mỗi ngày dữ liệu một lần; không tạo hành động. */
export async function shadowEvaluate(ctx: WorkspaceCtx, ruleId: string, clock: Clock = systemClock) {
  const [rule] = await ctx.db
    .select()
    .from(automationRules)
    .where(and(eq(automationRules.workspaceId, ctx.workspaceId), eq(automationRules.id, ruleId)));
  if (!rule || rule.mode !== 'shadow') return { status: 'skipped' as const };
  const ev = await evaluateRule(ctx, rule, clock);
  if (!ev) return { status: 'skipped' as const };
  const [dup] = await ctx.db
    .select({ id: ruleEvaluations.id })
    .from(ruleEvaluations)
    .where(
      and(
        eq(ruleEvaluations.workspaceId, ctx.workspaceId),
        eq(ruleEvaluations.ruleId, rule.id),
        eq(ruleEvaluations.asOfDate, ev.asOf),
      ),
    );
  if (dup) return { status: 'duplicate' as const };
  await ctx.db.insert(ruleEvaluations).values({
    workspaceId: ctx.workspaceId,
    ruleId: rule.id,
    mode: 'shadow',
    asOfDate: ev.asOf,
    evaluatedAt: clock.now(),
    matchedEntities: ev.matched,
    wouldDo: ev.wouldDo,
  });
  return { status: 'recorded' as const, matched: ev.matched.length };
}

/** P214: các lần đánh giá shadow / live gần nhất của rule. */
export async function ruleEvaluationsFor(ctx: ActorCtx, ruleId: string, limit = 30) {
  await getRule(ctx, ruleId);
  return ctx.db
    .select()
    .from(ruleEvaluations)
    .where(and(eq(ruleEvaluations.workspaceId, ctx.workspaceId), eq(ruleEvaluations.ruleId, ruleId)))
    .orderBy(desc(ruleEvaluations.evaluatedAt))
    .limit(limit);
}

/**
 * CHỈ LOCAL (ADR-0012 mục 4): giả lập `days` ngày chạy thử — ghi đánh giá shadow cho từng ngày trong quá khứ và
 * lùi mốc bắt đầu shadow, để PM thử luồng bật live trên máy dev. CLI kiểm `APP_ENV=local` trước khi gọi.
 */
export async function simulateShadowDays(ctx: WorkspaceCtx, ruleId: string, days: number, clock: Clock = systemClock) {
  const now = clock.now();
  let recorded = 0;
  for (let i = days; i >= 1; i--) {
    const at = { now: () => new Date(now.getTime() - i * 86_400_000) };
    if ((await shadowEvaluate(ctx, ruleId, at)).status === 'recorded') recorded++;
  }
  await ctx.db
    .update(automationRules)
    .set({ shadowStartedAt: new Date(now.getTime() - days * 86_400_000), updatedAt: now })
    .where(
      and(
        eq(automationRules.workspaceId, ctx.workspaceId),
        eq(automationRules.id, ruleId),
        eq(automationRules.mode, 'shadow'),
      ),
    );
  return { recorded };
}

/**
 * Rule live (P2b, `evaluate_rules`): đánh giá trên snapshot, tạo hành động `tier=auto` qua Execution Gateway
 * cho từng đối tượng khớp; ghi một dòng `rule_evaluations` (hành động đã tạo, lý do bị bỏ qua).
 */
export async function liveEvaluate(ctx: WorkspaceCtx, ruleId: string, deps: { enqueue: Enqueue; clock?: Clock }) {
  const clock = deps.clock ?? systemClock;
  const [rule] = await ctx.db
    .select()
    .from(automationRules)
    .where(and(eq(automationRules.workspaceId, ctx.workspaceId), eq(automationRules.id, ruleId)));
  if (!rule || rule.mode !== 'live') return { status: 'skipped' as const };
  const ev = await evaluateRule(ctx, rule, clock);
  if (!ev) return { status: 'skipped' as const };
  const created: string[] = [];
  const wouldDo: { metaId: string; actionType: string; newDailyBudget?: string | null; blockedBy?: string | null }[] =
    [];
  const now = clock.now();
  for (const w of ev.wouldDo) {
    // Revive (ADR-0021): đề xuất bật lại ngay (thông báo + Hoàn tác), một lần / hành động tạm dừng; không ghi Meta.
    if (w.suggestOnly) {
      const ok =
        !w.blockedBy && w.pauseActionId
          ? await scheduleRevert(ctx, { ruleId: rule.id, actionId: w.pauseActionId, kind: 'suggest_undo', dueAt: now })
          : false;
      wouldDo.push({
        metaId: w.metaId,
        actionType: 'suggest_resume',
        blockedBy: w.blockedBy ?? (ok ? null : 'already_suggested'),
      });
      continue;
    }
    const r = await requestAutoAction(
      ctx,
      {
        ruleId: rule.id,
        adAccountId: rule.adAccountId,
        actionType: w.actionType,
        targetMetaId: w.metaId,
        newDailyBudget: w.newDailyBudget,
        ruleMaxActionsPerDay: rule.guardrails.maxActionsPerDay,
        ruleExcludeMetaIds: rule.guardrails.excludeMetaIds,
        cooldownHours:
          rule.guardrails.cooldownHours ?? (rule.templateKey === 'sunset_loser' ? SUNSET_COOLDOWN_HOURS : undefined),
      },
      { enqueue: deps.enqueue, clock },
    );
    if ('action' in r) {
      created.push(r.action.id);
      // ADR-0021: Surf trả ngân sách / Stop-loss đề xuất bật lại vào giờ hẹn (giờ tài khoản).
      const rv = rule.action.revert;
      if (rv) {
        await scheduleRevert(ctx, {
          ruleId: rule.id,
          actionId: r.action.id,
          kind: rv.kind,
          dueAt: nextLocalHour(now, ev.timezone, rv.hour),
        });
      }
    }
    wouldDo.push({
      metaId: w.metaId,
      actionType: w.actionType,
      newDailyBudget: w.newDailyBudget,
      blockedBy: 'skipped' in r ? r.skipped : null,
    });
  }
  const blocked = wouldDo.filter((w) => w.blockedBy && w.blockedBy !== 'cooldown').map((w) => w.blockedBy);
  await ctx.db.insert(ruleEvaluations).values({
    workspaceId: ctx.workspaceId,
    ruleId: rule.id,
    mode: 'live',
    asOfDate: ev.asOf,
    evaluatedAt: clock.now(),
    matchedEntities: ev.matched,
    wouldDo,
    actionIds: created,
    blockedByGuardrail: blocked.length ? [...new Set(blocked)].join(',') : null,
  });
  return { status: 'evaluated' as const, created: created.length };
}

/**
 * P215 Hiệu quả tự động hóa (P2-14), 30 ngày: theo rule — số hành động, thành công, thất bại, hoàn tác (mục tiêu
 * ≤ 5%), chi tiêu 7 ngày trước của đối tượng bị tạm dừng (ước tính, không phải nhân quả).
 */
export async function automationEffectiveness(ctx: ActorCtx, opts: { days?: number; clock?: Clock } = {}) {
  assertCan(ctx.actor, 'automation.manage');
  const now = (opts.clock ?? systemClock).now();
  const since = new Date(now.getTime() - (opts.days ?? 30) * 86_400_000);
  const rules = await listRules(ctx);
  if (!rules.length) return [];
  const rows = await ctx.db.execute<{
    rule_id: string;
    total: string;
    success: string;
    failed: string;
    undone: string;
    paused_spend: string | null;
  }>(sql`
    select a.rule_id,
      count(*)::text as total,
      (count(*) filter (where a.status in ('success', 'undone')))::text as success,
      (count(*) filter (where a.status = 'failed'))::text as failed,
      (count(*) filter (where a.status = 'undone'))::text as undone,
      sum(case when a.action_type in ('pause_ad', 'pause_adset') and a.status = 'success' then (
        select sum(i.spend) from analytics.insights_daily i
        where i.workspace_id = a.workspace_id and i.ad_account_id = a.ad_account_id
          and (case when a.target_type = 'ad' then i.meta_id else i.adset_id end) = a.target_meta_id
          and i.date between (a.created_at::date - 7) and (a.created_at::date - 1)
      ) end)::text as paused_spend
    from app.actions a
    where a.workspace_id = ${ctx.workspaceId} and a.tier = 'auto' and a.rule_id is not null and a.created_at >= ${since.toISOString()}::timestamptz
    group by a.rule_id`);
  const byRule = new Map(rows.map((r) => [r.rule_id, r]));
  return rules.map((r) => {
    const x = byRule.get(r.id);
    const total = Number(x?.total ?? 0);
    const success = Number(x?.success ?? 0);
    const undone = Number(x?.undone ?? 0);
    return {
      ruleId: r.id,
      name: r.name,
      mode: r.mode,
      accountName: r.accountName,
      currency: r.currency,
      total,
      success,
      failed: Number(x?.failed ?? 0),
      undone,
      undoRate: success ? undone / success : null,
      pausedSpend7d: x?.paused_spend ?? '0',
    };
  });
}

/**
 * Sao chép rule sang tài khoản QC khác cùng workspace (ADR-0014): mỗi bản sao là rule riêng của một tài khoản, luôn
 * bắt đầu chạy thử 14 ngày; không kế thừa live, không chép danh sách loại trừ (id đối tượng của tài khoản gốc).
 * Bỏ qua tài khoản nguồn và tài khoản đã có bản sao cùng tên.
 */
export async function copyRule(
  ctx: ActorCtx,
  ruleId: string,
  targetAdAccountIds: string[],
  clock: Clock = systemClock,
): Promise<{ created: RuleRow[]; skipped: string[] }> {
  assertCan(ctx.actor, 'automation.manage');
  const src = await getRule(ctx, ruleId);
  const targets = [...new Set(targetAdAccountIds)];
  if (!targets.length || targets.length > 20) throw new AppError('VALIDATION_FAILED', 'Chọn 1–20 tài khoản');
  const visible = new Set((await listAdAccounts(ctx)).map((a) => a.id));
  if (targets.some((id) => !visible.has(id))) throw new AppError('NOT_FOUND', 'Không tìm thấy tài khoản');
  const existing = await ctx.db
    .select({ adAccountId: automationRules.adAccountId })
    .from(automationRules)
    .where(and(eq(automationRules.workspaceId, ctx.workspaceId), eq(automationRules.name, src.name)));
  const taken = new Set(existing.map((r) => r.adAccountId));
  const created: RuleRow[] = [];
  const skipped: string[] = [];
  for (const adAccountId of targets) {
    if (adAccountId === src.adAccountId || taken.has(adAccountId)) {
      skipped.push(adAccountId);
      continue;
    }
    created.push(
      await createRule(
        ctx,
        {
          adAccountId,
          name: src.name,
          templateKey: src.templateKey,
          level: src.level,
          match: src.match,
          condition: src.condition as RuleInput['condition'],
          action: src.action as RuleInput['action'],
          guardrails: {
            ...(src.guardrails.maxActionsPerDay ? { maxActionsPerDay: src.guardrails.maxActionsPerDay } : {}),
          },
        },
        clock,
      ),
    );
  }
  return { created, skipped };
}
