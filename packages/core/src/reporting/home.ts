import { listAssets } from '@adxlens/core/connections';
import { healthScores } from '@adxlens/core/insight';
import type { ActorCtx } from '@adxlens/core/shared';
import { metricSeries, metricValues, pctChange, type MetricKey, type MetricValues } from './metric-catalog';
import type { DateRange } from './metrics';

export type HomeKpi = {
  key: MetricKey;
  cur: string | null;
  prev: string | null;
  changePct: number | null;
  /** Giá trị theo ngày kỳ này / kỳ trước (sparkline), null khi ngày đó không có dữ liệu. */
  series: (string | null)[];
  prevSeries: (string | null)[];
};

export type WorkspaceHome = {
  kpis: HomeKpi[];
  /** Độ phủ dữ liệu: số ngày có insight / số ngày của kỳ (Madgicx "2 of 7 days"). */
  coverage: { days: number; total: number };
  /** Điểm sức khỏe: một tài khoản → điểm của nó; agency → thấp nhất (thận trọng) + trung bình. */
  health: { score: number | null; average: number | null; perAccount: { id: string; score: number }[] };
  /** Pixel của các tài khoản trong phạm vi, kèm lần bắn gần nhất (từ tài sản Meta, ADR-0016). */
  pixels: { id: string; name: string; lastFiredTime: string | null }[];
};

/** Trang chủ Workspace (W4): mọi số do code tính từ insight / phát hiện đã lưu, không LLM. */
export async function workspaceHome(
  ctx: ActorCtx,
  scope: { ids: string[]; metaAccountIds: string[]; cur: DateRange; prev: DateRange },
  metrics: MetricKey[],
): Promise<WorkspaceHome> {
  const [cur, prev, sCur, sPrev, health, assets] = await Promise.all([
    metricValues(ctx, scope.ids, scope.cur),
    metricValues(ctx, scope.ids, scope.prev),
    metricSeries(ctx, scope.ids, scope.cur),
    metricSeries(ctx, scope.ids, scope.prev),
    healthScores(ctx, scope.ids),
    listAssets(ctx, 'pixel'),
  ]);
  const pick = (v: MetricValues, k: MetricKey) => v[k];
  const kpis = metrics.map((key) => ({
    key,
    cur: pick(cur, key),
    prev: pick(prev, key),
    changePct: pctChange(pick(cur, key), pick(prev, key)),
    series: sCur.map((d) => (d.hasData ? d.values[key] : null)),
    prevSeries: sPrev.map((d) => (d.hasData ? d.values[key] : null)),
  }));
  const scores = [...health].map(([id, h]) => ({ id, score: h.score }));
  return {
    kpis,
    coverage: { days: sCur.filter((d) => d.hasData).length, total: sCur.length },
    health: {
      score: scores.length ? Math.min(...scores.map((s) => s.score)) : null,
      average: scores.length ? Math.round(scores.reduce((t, s) => t + s.score, 0) / scores.length) : null,
      perAccount: scores,
    },
    pixels: assets
      .filter((a) => a.parentId && scope.metaAccountIds.includes(a.parentId))
      .map((a) => ({ id: a.metaId, name: a.name, lastFiredTime: a.attrs.lastFiredTime ?? null })),
  };
}

/** Nhãn sức khỏe như Madgicx ("90 · Excellent"). */
export function healthLabel(score: number): 'excellent' | 'good' | 'fair' | 'poor' {
  return score >= 80 ? 'excellent' : score >= 60 ? 'good' : score >= 40 ? 'fair' : 'poor';
}

/** 4 KPI mặc định: theo mục tiêu Client (chính + phụ + chi tiêu) hoặc bộ của Madgicx. */
export function defaultHomeMetrics(
  goal: { primaryMetric: MetricKey | null; secondaryMetrics: MetricKey[] } | null,
): MetricKey[] {
  const base: MetricKey[] = ['spend', 'purchase_value', 'roas', 'cost_per_purchase'];
  if (!goal?.primaryMetric) return base;
  const out: MetricKey[] = ['spend', goal.primaryMetric, ...goal.secondaryMetrics];
  for (const k of ['results', 'cpa', 'ctr', 'cpm'] as MetricKey[]) if (out.length < 4 && !out.includes(k)) out.push(k);
  return [...new Set(out)].slice(0, 4);
}
