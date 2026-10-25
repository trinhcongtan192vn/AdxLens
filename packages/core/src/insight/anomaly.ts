import { and, eq, sql } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import type { Enqueue } from '@adxlens/jobs';
import { notify } from '@adxlens/core/notification';
import { addDays, localDate, notFound, systemClock, type Clock, type WorkspaceCtx } from '@adxlens/core/shared';

const { adAccounts } = schema;

/** Ngưỡng cảnh báo bất thường hằng ngày (roadmap A5). Thà ít cảnh báo chắc còn hơn nhiều cảnh báo sai. */
export const ANOMALY_CONFIG = {
  /** Số ngày nền (trước hôm qua) và số ngày nền tối thiểu có chi tiêu. */
  baselineDays: 7,
  minBaselineSpendDays: 5,
  /** Chi tiêu hôm qua ≥ ×2 trung bình nền và chênh ≥ mức tối thiểu. */
  spendSpikeX: 2,
  minSpendDeltaVnd: 500_000,
  minSpendDeltaOther: 20,
  /** CPA hôm qua ≥ ×1,5 CPA nền; cần ≥ 3 kết quả hôm qua và ≥ 10 kết quả trong nền. */
  cpaSpikeX: 1.5,
  minResultsYesterday: 3,
  minResultsBaseline: 10,
  /** Kết quả về 0 khi nền ≥ 3 kết quả/ngày và vẫn chi ≥ 50% mức thường. */
  minResultsPerDayForDrop: 3,
} as const;

export type AnomalyKind = 'spend_spike' | 'spend_stop' | 'cpa_spike' | 'results_drop';
export type Anomaly = { kind: AnomalyKind; pct: number | null };
type Day = { date: string; spend: number; results: number };

/**
 * Phát hiện bất thường của "hôm qua" so với 7 ngày trước đó (hàm thuần trên chuỗi chi tiêu / kết quả theo ngày đã
 * đồng bộ và đối chiếu). Không đủ dữ liệu nền → không báo gì.
 */
export function detectAnomalies(days: Day[], yesterday: string, currency: string): Anomaly[] {
  const c = ANOMALY_CONFIG;
  const y = days.find((d) => d.date === yesterday) ?? { date: yesterday, spend: 0, results: 0 };
  const from = addDays(yesterday, -c.baselineDays);
  const base = days.filter((d) => d.date >= from && d.date < yesterday);
  const spendDays = base.filter((d) => d.spend > 0);
  if (spendDays.length < c.minBaselineSpendDays) return [];
  const avgSpend = base.reduce((s, d) => s + d.spend, 0) / c.baselineDays;
  const baseResults = base.reduce((s, d) => s + d.results, 0);
  const minDelta = currency === 'VND' ? c.minSpendDeltaVnd : c.minSpendDeltaOther;
  const out: Anomaly[] = [];
  const pct = (a: number, b: number) => Math.round(((a - b) / b) * 100);

  if (y.spend >= avgSpend * c.spendSpikeX && y.spend - avgSpend >= minDelta) {
    out.push({ kind: 'spend_spike', pct: pct(y.spend, avgSpend) });
  }
  if (y.spend === 0 && avgSpend >= minDelta) out.push({ kind: 'spend_stop', pct: null });
  if (y.results >= c.minResultsYesterday && baseResults >= c.minResultsBaseline) {
    const cpaY = y.spend / y.results;
    const cpaB = base.reduce((s, d) => s + d.spend, 0) / baseResults;
    if (cpaY >= cpaB * c.cpaSpikeX) out.push({ kind: 'cpa_spike', pct: pct(cpaY, cpaB) });
  }
  if (
    y.results === 0 &&
    baseResults / c.baselineDays >= c.minResultsPerDayForDrop &&
    y.spend >= avgSpend * 0.5 &&
    y.spend > 0
  ) {
    out.push({ kind: 'results_drop', pct: null });
  }
  return out;
}

/**
 * Chạy kiểm bất thường cho một tài khoản sau audit (dữ liệu hôm qua đã đối chiếu): mỗi bất thường → thông báo
 * `anomaly` cho Owner + người được xem Client, chống trùng theo (tài khoản, ngày, loại).
 */
export async function runAnomalyCheck(
  ctx: WorkspaceCtx,
  adAccountId: string,
  deps: { enqueue?: Enqueue; clock?: Clock } = {},
) {
  const [a] = await ctx.db
    .select({
      id: adAccounts.id,
      name: adAccounts.name,
      timezone: adAccounts.timezone,
      currency: adAccounts.currency,
      clientId: adAccounts.clientId,
    })
    .from(adAccounts)
    .where(and(eq(adAccounts.workspaceId, ctx.workspaceId), eq(adAccounts.id, adAccountId)));
  if (!a) throw notFound('Tài khoản QC');
  const yesterday = addDays(localDate((deps.clock ?? systemClock).now(), a.timezone), -1);
  const from = addDays(yesterday, -ANOMALY_CONFIG.baselineDays);
  const rows = await ctx.db.execute<{ date: string; spend: string; results: string }>(sql`
    select date::text as date, coalesce(sum(spend), 0)::text as spend, coalesce(sum(results), 0)::text as results
    from analytics.insights_daily
    where workspace_id = ${ctx.workspaceId} and ad_account_id = ${a.id} and date between ${from}::date and ${yesterday}::date
    group by date`);
  const found = detectAnomalies(
    rows.map((r) => ({ date: r.date, spend: Number(r.spend), results: Number(r.results) })),
    yesterday,
    a.currency,
  );
  for (const x of found) {
    await notify(
      ctx,
      {
        kind: 'anomaly',
        recipients: { roles: ['owner', 'manager', 'buyer'], clientId: a.clientId },
        params: {
          account: a.name,
          date: `${yesterday.slice(8)}/${yesterday.slice(5, 7)}`,
          anomaly: x.kind,
          pct: x.pct ?? 0,
        },
        link: `/accounts/${a.id}`,
        dedupeKey: `anomaly:${a.id}:${yesterday}:${x.kind}`,
      },
      { enqueue: deps.enqueue },
    );
  }
  return { anomalies: found };
}
