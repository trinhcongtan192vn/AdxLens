import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import type { Enqueue } from '@adxlens/jobs';
import { listAdAccounts } from '@adxlens/core/connections';
import { notify } from '@adxlens/core/notification';
import {
  addDays,
  AppError,
  compareDecimal,
  localDate,
  notFound,
  systemClock,
  type ActorCtx,
  type Clock,
  type WorkspaceCtx,
} from '@adxlens/core/shared';
import {
  computeMetrics,
  METRIC_DEFS,
  metricSeries,
  metricValues,
  metricValuesForAccounts,
  sumRaw,
  type MetricKey,
} from './metric-catalog';

const { customAlerts, adAccounts } = schema;

/** Giới hạn số cảnh báo mỗi workspace (ADR-0018). */
export const MAX_ALERTS_PER_WORKSPACE = 50;

/** Chỉ số đặt cảnh báo được (bỏ số đếm thô như lượt hiển thị). */
export const ALERT_METRICS = [
  'spend',
  'cpa',
  'cpm',
  'cpc',
  'ctr',
  'roas',
  'cost_per_purchase',
  'cpl',
  'cost_per_add_to_cart',
  'frequency',
  'results',
] as const satisfies readonly MetricKey[];
export type AlertMetric = (typeof ALERT_METRICS)[number];

const METRIC_LABEL: Record<AlertMetric, { vi: string; en: string }> = {
  spend: { vi: 'Chi tiêu', en: 'Spend' },
  cpa: { vi: 'Chi phí / kết quả', en: 'Cost per result' },
  cpm: { vi: 'CPM', en: 'CPM' },
  cpc: { vi: 'CPC', en: 'CPC' },
  ctr: { vi: 'CTR', en: 'CTR' },
  roas: { vi: 'ROAS', en: 'ROAS' },
  cost_per_purchase: { vi: 'Chi phí / lượt mua', en: 'Cost per purchase' },
  cpl: { vi: 'Chi phí / lead', en: 'Cost per lead' },
  cost_per_add_to_cart: { vi: 'Chi phí / thêm giỏ', en: 'Cost per add to cart' },
  frequency: { vi: 'Tần suất', en: 'Frequency' },
  results: { vi: 'Kết quả', en: 'Results' },
};

export type CustomAlert = typeof customAlerts.$inferSelect;

async function visibleAccounts(ctx: ActorCtx) {
  return listAdAccounts(ctx);
}

/** Danh sách cảnh báo của workspace (buyer chỉ thấy cảnh báo của tài khoản mình xem được + cảnh báo của mình). */
export async function listAlerts(ctx: ActorCtx): Promise<CustomAlert[]> {
  const rows = await ctx.db
    .select()
    .from(customAlerts)
    .where(eq(customAlerts.workspaceId, ctx.workspaceId))
    .orderBy(desc(customAlerts.createdAt));
  const visible = new Set((await visibleAccounts(ctx)).map((a) => a.id));
  return rows.filter((r) =>
    r.adAccountId ? visible.has(r.adAccountId) : r.createdBy === ctx.actor.userId || ctx.actor.role !== 'buyer',
  );
}

export type AlertInput = {
  adAccountId: string | null;
  metric: AlertMetric;
  condition: 'above' | 'below';
  threshold: string;
  window: '1d' | '7d';
};

/** Tạo cảnh báo. Tài khoản phải thuộc quyền xem; null (mọi tài khoản) chỉ owner / manager. */
export async function createAlert(ctx: ActorCtx, input: AlertInput): Promise<CustomAlert> {
  if (!(ALERT_METRICS as readonly string[]).includes(input.metric)) {
    throw new AppError('VALIDATION_FAILED', 'Chỉ số không hợp lệ');
  }
  if (!/^\d{1,14}(\.\d{1,4})?$/.test(input.threshold)) throw new AppError('VALIDATION_FAILED', 'Ngưỡng không hợp lệ');
  const accounts = await visibleAccounts(ctx);
  let currency: string | null = null;
  if (input.adAccountId) {
    const a = accounts.find((x) => x.id === input.adAccountId);
    if (!a) throw notFound('Tài khoản QC');
    currency = a.currency;
  } else {
    if (ctx.actor.role === 'buyer')
      throw new AppError('FORBIDDEN', 'Chỉ owner / manager đặt cảnh báo cho mọi tài khoản');
    currency = mainCurrency(accounts);
  }
  const existing = await ctx.db
    .select({ id: customAlerts.id })
    .from(customAlerts)
    .where(eq(customAlerts.workspaceId, ctx.workspaceId));
  if (existing.length >= MAX_ALERTS_PER_WORKSPACE) {
    throw new AppError('CONFLICT', `Tối đa ${MAX_ALERTS_PER_WORKSPACE} cảnh báo mỗi workspace`);
  }
  const [row] = await ctx.db
    .insert(customAlerts)
    .values({
      workspaceId: ctx.workspaceId,
      adAccountId: input.adAccountId,
      currency,
      metric: input.metric,
      condition: input.condition,
      threshold: input.threshold,
      window: input.window,
      createdBy: ctx.actor.userId,
    })
    .returning();
  return row!;
}

async function ownAlert(ctx: ActorCtx, id: string): Promise<CustomAlert> {
  const a = (await listAlerts(ctx)).find((x) => x.id === id);
  if (!a) throw notFound('Cảnh báo');
  if (ctx.actor.role === 'buyer' && a.createdBy !== ctx.actor.userId) throw new AppError('FORBIDDEN', 'Không có quyền');
  return a;
}

export async function setAlertEnabled(ctx: ActorCtx, id: string, enabled: boolean): Promise<void> {
  await ownAlert(ctx, id);
  await ctx.db
    .update(customAlerts)
    .set({ enabled })
    .where(and(eq(customAlerts.workspaceId, ctx.workspaceId), eq(customAlerts.id, id)));
}

export async function deleteAlert(ctx: ActorCtx, id: string): Promise<void> {
  await ownAlert(ctx, id);
  await ctx.db.delete(customAlerts).where(and(eq(customAlerts.workspaceId, ctx.workspaceId), eq(customAlerts.id, id)));
}

function mainCurrency(accounts: { currency: string }[]): string | null {
  const count = new Map<string, number>();
  for (const a of accounts) count.set(a.currency, (count.get(a.currency) ?? 0) + 1);
  return [...count].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
}

export type AlertSuggestion = {
  metric: AlertMetric;
  condition: 'above' | 'below';
  /** Ngưỡng gợi ý (phân vị 90 với chỉ số chi phí, 10 với chỉ số "càng cao càng tốt"). */
  threshold: string;
  /** Khoảng của giá trị 7 ngày trượt trong 30 ngày qua — để người dùng thấy ngưỡng lấy từ đâu. */
  min: string;
  max: string;
  current: string | null;
};

const SUGGEST_METRICS: AlertMetric[] = ['cpm', 'cpa', 'cpc', 'ctr', 'roas', 'cost_per_purchase', 'cpl'];

/** Phân vị trên mảng đã sắp (nội suy gần nhất), giữ chuỗi gốc để không đổi số. */
function quantile(sorted: string[], q: number): string {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))]!;
}

/**
 * Gợi ý cảnh báo từ dữ liệu (Madgicx "CPM 7 ngày dao động ₫27K–₫49K trong 30 ngày → báo khi vượt ₫48K"): giá trị 7 ngày
 * trượt của 30 ngày qua (cần ≥ 14 cửa sổ có số). Số do code tính, không LLM.
 */
export async function alertSuggestions(
  ctx: ActorCtx,
  ids: string[],
  timezone: string,
  clock: Clock = systemClock,
): Promise<AlertSuggestion[]> {
  if (!ids.length) return [];
  const y = addDays(localDate(clock.now(), timezone), -1);
  const from = addDays(y, -35);
  const [series, current] = await Promise.all([
    metricSeries(ctx, ids, { from, to: y }),
    metricValues(ctx, ids, { from: addDays(y, -6), to: y }),
  ]);
  const out: AlertSuggestion[] = [];
  for (const m of SUGGEST_METRICS) {
    const windows: string[] = [];
    for (let end = 6; end < series.length; end++) {
      if (end < series.length - 30) continue;
      const win = series.slice(end - 6, end + 1);
      if (win.filter((d) => d.hasData).length < 5) continue;
      // Giá trị 7 ngày = chỉ số tính trên TỔNG thành phần của 7 ngày (không trung bình các tỷ lệ).
      const v = computeMetrics(sumRaw(win.map((d) => d.raw)))[m];
      if (v == null) continue;
      windows.push(v);
    }
    if (windows.length < 14) continue;
    const sorted = [...windows].sort((a, b) => Number(a) - Number(b));
    const down = METRIC_DEFS[m].better === 'down';
    out.push({
      metric: m,
      condition: down ? 'above' : 'below',
      threshold: quantile(sorted, down ? 0.9 : 0.1),
      min: sorted[0]!,
      max: sorted[sorted.length - 1]!,
      current: current[m],
    });
  }
  return out.slice(0, 4);
}

/**
 * Đánh giá cảnh báo sau audit hằng ngày của một tài khoản (worker): cảnh báo của tài khoản đó + cảnh báo "mọi tài
 * khoản" cùng tiền tệ. Mỗi cảnh báo bắn tối đa 1 lần cho mỗi ngày dữ liệu (`last_fired_on`).
 */
export async function runCustomAlerts(
  ctx: WorkspaceCtx,
  adAccountId: string,
  deps: { enqueue?: Enqueue; clock?: Clock } = {},
): Promise<{ evaluated: number; fired: number }> {
  const [acc] = await ctx.db
    .select({
      id: adAccounts.id,
      name: adAccounts.name,
      timezone: adAccounts.timezone,
      currency: adAccounts.currency,
      clientId: adAccounts.clientId,
    })
    .from(adAccounts)
    .where(and(eq(adAccounts.workspaceId, ctx.workspaceId), eq(adAccounts.id, adAccountId)));
  if (!acc) throw notFound('Tài khoản QC');
  const alerts = await ctx.db
    .select()
    .from(customAlerts)
    .where(
      and(
        eq(customAlerts.workspaceId, ctx.workspaceId),
        eq(customAlerts.enabled, true),
        or(
          eq(customAlerts.adAccountId, acc.id),
          and(isNull(customAlerts.adAccountId), eq(customAlerts.currency, acc.currency)),
        ),
      ),
    );
  const y = addDays(localDate((deps.clock ?? systemClock).now(), acc.timezone), -1);
  let fired = 0;
  for (const al of alerts) {
    if (al.lastFiredOn === y) continue;
    const ids = al.adAccountId
      ? [al.adAccountId]
      : (
          await ctx.db
            .select({ id: adAccounts.id })
            .from(adAccounts)
            .where(and(eq(adAccounts.workspaceId, ctx.workspaceId), eq(adAccounts.currency, acc.currency)))
        ).map((r) => r.id);
    const range = al.window === '7d' ? { from: addDays(y, -6), to: y } : { from: y, to: y };
    const values = await metricValuesForAccounts(ctx, ids, range);
    const v = values[al.metric as MetricKey];
    if (v == null) continue;
    const cmp = compareDecimal(v, al.threshold, 4);
    const hit = al.condition === 'above' ? cmp > 0 : cmp < 0;
    if (!hit) continue;
    const label = METRIC_LABEL[al.metric as AlertMetric] ?? { vi: al.metric, en: al.metric };
    await notify(
      ctx,
      {
        kind: 'custom_alert',
        recipients: al.adAccountId
          ? { userIds: [al.createdBy], roles: ['owner'], clientId: acc.clientId }
          : { userIds: [al.createdBy] },
        params: {
          scope: al.adAccountId ? acc.name : '',
          scopeAll: al.adAccountId ? 'no' : 'yes',
          metric: al.metric,
          metricVi: label.vi,
          metricEn: label.en,
          cond: al.condition,
          value: v,
          threshold: al.threshold,
          currency: al.currency ?? '',
          date: `${y.slice(8)}/${y.slice(5, 7)}`,
        },
        link: '/w/alerts',
        dedupeKey: `custom_alert:${al.id}:${y}`,
      },
      { enqueue: deps.enqueue },
    );
    await ctx.db
      .update(customAlerts)
      .set({ lastFiredOn: y, lastValue: v })
      .where(and(eq(customAlerts.workspaceId, ctx.workspaceId), eq(customAlerts.id, al.id)));
    fired++;
  }
  return { evaluated: alerts.length, fired };
}
