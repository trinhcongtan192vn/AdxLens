import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '@adxlens/db';
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
import { minorUnits } from './gateway';
import { checkGuardrails, effectiveGuardrails, GUARDRAIL_DEFAULTS, type ActionType } from './guardrails';

const { automationRules, ruleEvaluations, recommendations } = schema;

export const RULE_METRICS = [
  'spend',
  'results',
  'cpa',
  'ctr',
  'frequency',
  'ctr_change_pct',
  'cpa_change_pct',
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
export const ruleActionSchema = z.object({
  type: z.enum(['pause_ad', 'pause_adset', 'set_adset_budget']),
  changePct: decimal.optional(),
  maxDailyBudget: z
    .string()
    .regex(/^\d{1,14}$/)
    .optional(),
});
export const ruleInputSchema = z.object({
  adAccountId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  templateKey: z.string().max(60).nullish(),
  level: z.enum(['ad', 'adset']),
  condition: z.array(ruleConditionSchema).min(1).max(6),
  action: ruleActionSchema,
  guardrails: z
    .object({
      maxActionsPerDay: z.number().int().min(1).optional(),
      excludeMetaIds: z
        .array(z.string().regex(/^\d{1,30}$/))
        .max(500)
        .optional(),
    })
    .default({}),
});
export type RuleInput = z.input<typeof ruleInputSchema>;
export type RuleRow = typeof automationRules.$inferSelect;

/** Mẫu dựng sẵn từ gợi ý P1 (P2-10), sắp theo số gợi ý loại đó đã được làm. */
export const RULE_TEMPLATES: (Omit<z.output<typeof ruleInputSchema>, 'adAccountId' | 'name' | 'guardrails'> & {
  key: string;
  sourceKey: string;
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
];

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
  if (r.action.type !== 'pause_ad' && r.level !== 'adset')
    throw new AppError('VALIDATION_FAILED', 'Hành động này cần cấp ad set');
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

export async function listRules(ctx: ActorCtx) {
  const accounts = await listAdAccounts(ctx);
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
        sum(i.results) filter (where i.date between ${prevFrom} and ${prevTo}) as p_results
      from analytics.insights_daily i
      where i.workspace_id = ${ctx.workspaceId} and i.ad_account_id = ${adAccountId} and i.entity_type = 'ad'
        and i.date between ${prevFrom} and ${asOf} and ${key} is not null
      group by ${key}
    )
    select e.meta_id, e.name, e.status, e.daily_budget::text as daily_budget, e.parent_meta_id as parent,
      w.spend::text as spend, w.impressions::text as impressions, w.link_clicks::text as link_clicks,
      w.results::text as results, w.freq_w::text as freq_w, w.p_spend::text as p_spend,
      w.p_impressions::text as p_impressions, w.p_link_clicks::text as p_link_clicks, w.p_results::text as p_results
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
      },
    };
  });
}

/** Khớp điều kiện (VÀ). Chỉ số không tính được (null) → không khớp. Chỉ đối tượng đang chạy. */
export function matchConditions(
  conditions: { metric: string; op: string; value: string }[],
  e: Pick<EntityMetrics, 'metrics' | 'status'>,
): boolean {
  if (e.status !== 'ACTIVE') return false;
  return conditions.every((c) => {
    const v = e.metrics[c.metric as RuleMetric];
    if (v === null || v === undefined) return false;
    const cmp = compareDecimal(v, c.value);
    return c.op === 'gte' ? cmp >= 0 : cmp <= 0;
  });
}

/** Ngân sách mới cho rule: hiện tại × (1 + %), làm tròn xuống, không vượt trần người dùng đặt. */
export function ruleBudget(current: string | null, changePct: string, maxDailyBudget?: string | null): string | null {
  if (!current) return null;
  const pct = Math.round(Number(changePct) * 100); // phần trăm × 100 (số nguyên)
  let next = (BigInt(current) * BigInt(10_000 + pct)) / 10_000n;
  if (maxDailyBudget && next > BigInt(maxDailyBudget)) next = BigInt(maxDailyBudget);
  return next.toString();
}

export type WouldDo = { metaId: string; name: string | null; actionType: ActionType; newDailyBudget: string | null };

function plan(rule: Pick<RuleRow, 'action'>, matched: EntityMetrics[]): WouldDo[] {
  return matched.map((e) => ({
    metaId: e.metaId,
    name: e.name,
    actionType: rule.action.type as ActionType,
    newDailyBudget:
      rule.action.type === 'set_adset_budget'
        ? ruleBudget(e.dailyBudget, rule.action.changePct ?? '0', rule.action.maxDailyBudget)
        : null,
  }));
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
      (e) => matchConditions(r.condition, e) && !(r.guardrails.excludeMetaIds ?? []).includes(e.metaId),
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
  const matched = metrics.filter((e) => matchConditions(rule.condition, e));
  const wouldDo = plan(rule, matched).map((w) => {
    const e = matched.find((x) => x.metaId === w.metaId)!;
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
    return { ...w, blockedBy: v.length ? v.map((x) => x.code).join(',') : null };
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
