import { and, eq, inArray } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import type { WorkspaceCtx } from '@adxlens/core/shared';
import type { Severity } from './types';

const { findings } = schema;

/** L3 8: điểm trừ theo mức độ, trần mỗi nhóm −30, sàn 0. Cấu hình nội bộ, có test khóa. */
export const HEALTH_PENALTY: Record<Severity, number> = { high: 15, medium: 7, low: 3 };
export const HEALTH_GROUP_CAP = 30;

export type HealthScore = {
  score: number;
  /** Từng nhóm trừ bao nhiêu điểm — không là hộp đen (L2 5.3). */
  components: { group: string; penalty: number; findings: number }[];
};

export function computeHealth(items: { ruleGroup: string; severity: Severity }[]): HealthScore {
  const byGroup = new Map<string, { penalty: number; findings: number }>();
  for (const f of items) {
    const g = byGroup.get(f.ruleGroup) ?? { penalty: 0, findings: 0 };
    g.penalty += HEALTH_PENALTY[f.severity];
    g.findings += 1;
    byGroup.set(f.ruleGroup, g);
  }
  const components = [...byGroup].map(([group, g]) => ({
    group,
    penalty: Math.min(HEALTH_GROUP_CAP, g.penalty),
    findings: g.findings,
  }));
  components.sort((a, b) => b.penalty - a.penalty || a.group.localeCompare(b.group));
  const score = Math.max(0, 100 - components.reduce((t, c) => t + c.penalty, 0));
  return { score, components };
}

/** Health score theo tài khoản từ phát hiện đang mở (`new`, `seen`). */
export async function healthScores(ctx: WorkspaceCtx, adAccountIds: string[]): Promise<Map<string, HealthScore>> {
  const out = new Map<string, HealthScore>();
  if (!adAccountIds.length) return out;
  const rows = await ctx.db
    .select({ adAccountId: findings.adAccountId, ruleGroup: findings.ruleGroup, severity: findings.severity })
    .from(findings)
    .where(
      and(
        eq(findings.workspaceId, ctx.workspaceId),
        inArray(findings.adAccountId, adAccountIds),
        inArray(findings.status, ['new', 'seen']),
      ),
    );
  for (const id of adAccountIds) out.set(id, computeHealth(rows.filter((r) => r.adAccountId === id)));
  return out;
}
