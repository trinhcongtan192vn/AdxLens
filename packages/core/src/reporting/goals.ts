import { and, eq } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import { listAdAccounts, listAssets } from '@adxlens/core/connections';
import {
  addDays,
  AppError,
  localDate,
  notFound,
  sumDecimal,
  systemClock,
  type ActorCtx,
  type Clock,
} from '@adxlens/core/shared';
import { assertCan, assertClientAccess } from '@adxlens/core/tenancy';
import { isValidIndustry } from './industries';
import { GOAL_METRICS, METRIC_DEFS, metricValues, type GoalMetric, type MetricValues } from './metric-catalog';

const { clientGoals, clients } = schema;

export type ClientGoal = {
  clientId: string;
  primaryMetric: GoalMetric | null;
  primaryTarget: string | null;
  currency: string | null;
  secondaryMetrics: GoalMetric[];
  industry: string | null;
  subIndustry: string | null;
  defaultPageId: string | null;
  defaultInstagramId: string | null;
  defaultPixelId: string | null;
  onboardedAt: Date | null;
};

const isGoalMetric = (m: string | null): m is GoalMetric =>
  m != null && (GOAL_METRICS as readonly string[]).includes(m);

async function assertClient(ctx: ActorCtx, clientId: string) {
  assertClientAccess(ctx.actor, clientId);
  const [c] = await ctx.db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.workspaceId, ctx.workspaceId), eq(clients.id, clientId)));
  if (!c) throw notFound('Client');
}

/** Mục tiêu của Client; chưa đặt → null. */
export async function getClientGoal(ctx: ActorCtx, clientId: string): Promise<ClientGoal | null> {
  await assertClient(ctx, clientId);
  const [g] = await ctx.db
    .select()
    .from(clientGoals)
    .where(and(eq(clientGoals.workspaceId, ctx.workspaceId), eq(clientGoals.clientId, clientId)));
  if (!g) return null;
  return {
    clientId,
    primaryMetric: isGoalMetric(g.primaryMetric) ? g.primaryMetric : null,
    primaryTarget: g.primaryTarget,
    currency: g.currency,
    secondaryMetrics: g.secondaryMetrics.filter(isGoalMetric),
    industry: g.industry,
    subIndustry: g.subIndustry,
    defaultPageId: g.defaultPageId,
    defaultInstagramId: g.defaultInstagramId,
    defaultPixelId: g.defaultPixelId,
    onboardedAt: g.onboardedAt,
  };
}

/** Mọi mục tiêu của workspace (Home, danh sách Client, "Khách cần chú ý"). */
export async function listClientGoals(ctx: ActorCtx): Promise<Map<string, ClientGoal>> {
  const rows = await ctx.db.select().from(clientGoals).where(eq(clientGoals.workspaceId, ctx.workspaceId));
  const out = new Map<string, ClientGoal>();
  for (const g of rows) {
    out.set(g.clientId, {
      clientId: g.clientId,
      primaryMetric: isGoalMetric(g.primaryMetric) ? g.primaryMetric : null,
      primaryTarget: g.primaryTarget,
      currency: g.currency,
      secondaryMetrics: g.secondaryMetrics.filter(isGoalMetric),
      industry: g.industry,
      subIndustry: g.subIndustry,
      defaultPageId: g.defaultPageId,
      defaultInstagramId: g.defaultInstagramId,
      defaultPixelId: g.defaultPixelId,
      onboardedAt: g.onboardedAt,
    });
  }
  return out;
}

export type ClientGoalInput = {
  primaryMetric?: GoalMetric | null;
  primaryTarget?: string | null;
  secondaryMetrics?: GoalMetric[];
  industry?: string | null;
  subIndustry?: string | null;
  defaultPageId?: string | null;
  defaultInstagramId?: string | null;
  defaultPixelId?: string | null;
  /** true: đánh dấu đã xong onboarding (bước cuối hoặc "Để sau"). */
  complete?: boolean;
};

/** Lưu (một phần) mục tiêu Client. Kiểm chỉ số trong danh mục, ngành hợp lệ, tài sản thuộc workspace. */
export async function saveClientGoal(ctx: ActorCtx, clientId: string, input: ClientGoalInput): Promise<ClientGoal> {
  assertCan(ctx.actor, 'clients.manage');
  await assertClient(ctx, clientId);
  const cur = await getClientGoal(ctx, clientId);
  const next = {
    primaryMetric: input.primaryMetric !== undefined ? input.primaryMetric : (cur?.primaryMetric ?? null),
    primaryTarget: input.primaryTarget !== undefined ? input.primaryTarget : (cur?.primaryTarget ?? null),
    secondaryMetrics: input.secondaryMetrics ?? cur?.secondaryMetrics ?? [],
    industry: input.industry !== undefined ? input.industry : (cur?.industry ?? null),
    subIndustry: input.subIndustry !== undefined ? input.subIndustry : (cur?.subIndustry ?? null),
    defaultPageId: input.defaultPageId !== undefined ? input.defaultPageId : (cur?.defaultPageId ?? null),
    defaultInstagramId:
      input.defaultInstagramId !== undefined ? input.defaultInstagramId : (cur?.defaultInstagramId ?? null),
    defaultPixelId: input.defaultPixelId !== undefined ? input.defaultPixelId : (cur?.defaultPixelId ?? null),
  };
  if (next.primaryMetric != null && !isGoalMetric(next.primaryMetric)) {
    throw new AppError('VALIDATION_FAILED', 'Chỉ số mục tiêu không hợp lệ');
  }
  if (next.primaryTarget != null) {
    if (!/^\d+(\.\d+)?$/.test(next.primaryTarget) || Number(next.primaryTarget) <= 0) {
      throw new AppError('VALIDATION_FAILED', 'Mục tiêu phải là số dương');
    }
  }
  const sec = [...new Set(next.secondaryMetrics)];
  if (sec.length > 2 || sec.some((m) => !isGoalMetric(m) || m === next.primaryMetric)) {
    throw new AppError('VALIDATION_FAILED', 'Chỉ số phụ: tối đa 2, khác chỉ số chính');
  }
  if (!isValidIndustry(next.industry, next.subIndustry)) throw new AppError('VALIDATION_FAILED', 'Ngành không hợp lệ');
  const assets = await listAssets(ctx);
  const owns = (kind: 'page' | 'instagram' | 'pixel', id: string | null) =>
    id == null || assets.some((a) => a.kind === kind && a.metaId === id);
  if (
    !owns('page', next.defaultPageId) ||
    !owns('instagram', next.defaultInstagramId) ||
    !owns('pixel', next.defaultPixelId)
  ) {
    throw new AppError('VALIDATION_FAILED', 'Tài sản không thuộc kết nối của workspace');
  }
  // Tiền tệ của mục tiêu = tiền tệ chính của Client (chỉ số tiền); tỷ lệ không cần.
  const currency =
    next.primaryMetric && METRIC_DEFS[next.primaryMetric].kind === 'money' ? await mainCurrency(ctx, clientId) : null;
  const values = {
    ...next,
    secondaryMetrics: sec,
    currency,
    updatedBy: ctx.actor.userId,
    ...(input.complete ? { onboardedAt: cur?.onboardedAt ?? new Date() } : {}),
  };
  await ctx.db
    .insert(clientGoals)
    .values({ workspaceId: ctx.workspaceId, clientId, ...values })
    .onConflictDoUpdate({ target: [clientGoals.workspaceId, clientGoals.clientId], set: values });
  return (await getClientGoal(ctx, clientId))!;
}

async function clientAccounts(ctx: ActorCtx, clientId: string) {
  return (await listAdAccounts(ctx, { clientId })).filter((a) => a.assignmentStatus === 'confirmed' || a.clientId);
}

/** Tiền tệ có nhiều tài khoản nhất của Client (gợi ý chỉ tính trên tài khoản cùng tiền tệ). */
async function mainCurrency(ctx: ActorCtx, clientId: string): Promise<string | null> {
  const accs = await clientAccounts(ctx, clientId);
  const count = new Map<string, number>();
  for (const a of accs) count.set(a.currency, (count.get(a.currency) ?? 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

export type GoalSuggestions = {
  currency: string | null;
  /** Client có tài khoản khác tiền tệ (bị bỏ khỏi gợi ý). */
  mixedCurrency: boolean;
  accounts: number;
  yesterday: MetricValues;
  last7: MetricValues;
  last30: MetricValues;
  spend30: string;
};

/**
 * Giá trị thực tế để đặt mục tiêu sát thực tế (Madgicx onboarding bước 1–2): hôm qua / 7 / 30 ngày tới hôm qua theo
 * múi giờ tài khoản. Số do code tính, không LLM.
 */
export async function goalSuggestions(
  ctx: ActorCtx,
  clientId: string,
  clock: Clock = systemClock,
): Promise<GoalSuggestions> {
  await assertClient(ctx, clientId);
  const accs = await clientAccounts(ctx, clientId);
  const currency = await mainCurrency(ctx, clientId);
  const same = accs.filter((a) => a.currency === currency);
  const tz = same[0]?.timezone ?? 'UTC';
  const y = addDays(localDate(clock.now(), tz), -1);
  const ids = same.map((a) => a.id);
  const [yesterday, last7, last30] = await Promise.all([
    metricValues(ctx, ids, { from: y, to: y }),
    metricValues(ctx, ids, { from: addDays(y, -6), to: y }),
    metricValues(ctx, ids, { from: addDays(y, -29), to: y }),
  ]);
  return {
    currency,
    mixedCurrency: same.length < accs.length,
    accounts: same.length,
    yesterday,
    last7,
    last30,
    spend30: sumDecimal([last30.spend]),
  };
}

/** % lệch so với mục tiêu theo hướng tốt của chỉ số: dương = tốt hơn mục tiêu. Null khi thiếu số. */
export function vsTarget(metric: GoalMetric, actual: string | null, target: string | null): number | null {
  if (actual == null || target == null || Number(target) === 0) return null;
  const diff = (Number(actual) - Number(target)) / Number(target);
  const signed = METRIC_DEFS[metric].better === 'down' ? -diff : diff;
  return Math.round(signed * 1000) / 10;
}

/**
 * "Khách cần chú ý khi lệch mục tiêu" (ADR-0017): mỗi Client có mục tiêu → giá trị 7 ngày qua (tài khoản cùng tiền tệ
 * mục tiêu) và % so với mục tiêu theo hướng tốt. Số do code tính.
 */
export async function clientGoalStatus(
  ctx: ActorCtx,
  clock: Clock = systemClock,
): Promise<Map<string, { metric: GoalMetric; actual: string | null; target: string; vsTargetPct: number | null }>> {
  const goals = await listClientGoals(ctx);
  const accounts = await listAdAccounts(ctx);
  const out = new Map<
    string,
    { metric: GoalMetric; actual: string | null; target: string; vsTargetPct: number | null }
  >();
  for (const [clientId, g] of goals) {
    if (!g.primaryMetric || !g.primaryTarget) continue;
    const accs = accounts.filter((a) => a.clientId === clientId && (!g.currency || a.currency === g.currency));
    if (!accs.length) continue;
    const y = addDays(localDate(clock.now(), accs[0]!.timezone), -1);
    const v = await metricValues(
      ctx,
      accs.map((a) => a.id),
      { from: addDays(y, -6), to: y },
    );
    const actual = v[g.primaryMetric];
    out.set(clientId, {
      metric: g.primaryMetric,
      actual,
      target: g.primaryTarget,
      vsTargetPct: vsTarget(g.primaryMetric, actual, g.primaryTarget),
    });
  }
  return out;
}
