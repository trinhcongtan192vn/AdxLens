import { and, eq, gte, sql } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import { registerFlagCheck } from '@adxlens/core/flags';
import { systemClock, type Clock } from '@adxlens/core/shared';

const { featureFlags, findingFeedback } = schema;

/** Ngưỡng checklist cờ `p1_recommendations` (L3 18.3): P0 bật ≥ 14 ngày; tỷ lệ phát hiện "sai" ≤ 20%. */
export const P1_CHECK = { p0Days: 14, maxWrongRate: 0.2, windowDays: 30 } as const;

export function registerRecommendationFlagChecks(clock: Clock = systemClock): void {
  registerFlagCheck('p1_recommendations', {
    id: 'p0_enabled_14d',
    label: `Báo cáo (P0) đã bật ≥ ${P1_CHECK.p0Days} ngày`,
    run: async (db, workspaceId) => {
      const [f] = await db
        .select({ enabled: featureFlags.enabled, at: featureFlags.enabledAt })
        .from(featureFlags)
        .where(and(eq(featureFlags.workspaceId, workspaceId), eq(featureFlags.flagKey, 'p0_reports')));
      if (!f?.enabled || !f.at) return { passed: false, detail: 'Báo cáo chưa bật' };
      const days = Math.floor((clock.now().getTime() - f.at.getTime()) / 86_400_000);
      return days >= P1_CHECK.p0Days ? { passed: true } : { passed: false, detail: `Mới bật ${days} ngày` };
    },
  });
  registerFlagCheck('p1_recommendations', {
    id: 'wrong_rate_20',
    label: `Tỷ lệ phát hiện bị đánh dấu "sai" ≤ ${P1_CHECK.maxWrongRate * 100}% (${P1_CHECK.windowDays} ngày)`,
    run: async (db, workspaceId) => {
      const since = new Date(clock.now().getTime() - P1_CHECK.windowDays * 86_400_000);
      const [r] = await db
        .select({
          total: sql<number>`count(distinct ${findingFeedback.findingId})::int`,
          wrong: sql<number>`(count(distinct ${findingFeedback.findingId}) filter (where ${findingFeedback.kind} = 'wrong'))::int`,
        })
        .from(findingFeedback)
        .where(and(eq(findingFeedback.workspaceId, workspaceId), gte(findingFeedback.createdAt, since)));
      if (!r?.total) return { passed: true, detail: 'Chưa có phản hồi' };
      const rate = r.wrong / r.total;
      return rate <= P1_CHECK.maxWrongRate
        ? { passed: true, detail: `${Math.round(rate * 100)}%` }
        : { passed: false, detail: `${Math.round(rate * 100)}% phát hiện bị đánh dấu sai` };
    },
  });
}
