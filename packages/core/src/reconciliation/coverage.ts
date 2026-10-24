import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import type { WorkspaceCtx } from '@adxlens/core/shared';

const { adAccounts, entities, insightsDaily, reconciliationResults } = schema;

export type AccountCoverage = {
  adAccountId: string;
  name: string;
  metaAccountId: string;
  currency: string;
  timezone: string;
  daysWithData: number;
  reconciliation: { days: number; warningDays: number; maxSpendDeltaPct: string | null };
  /** Tỷ lệ dòng ad-ngày có chỉ số (0–1): để biết rule audit nào có dữ liệu (L3 17, E4). */
  coverage: { frequency: number; conversionValue: number; results: number; linkClicks: number };
  resultTypes: string[];
  entities: { campaign: number; adset: number; ad: number; creative: number };
  creativesWithThumbnail: number;
  videoCreatives: number;
  adsetsWithLearningStage: number;
  adsetsWithBudget: number;
};

/**
 * Báo cáo E4 (L3 mục 17, B1): cho từng tài khoản trong workspace — độ lệch đối chiếu và mức phủ dữ liệu
 * theo nhóm chỉ số, để PM quyết rule audit nào giữ. Chỉ đọc, trong một workspace.
 */
export async function dataCoverageReport(
  ctx: WorkspaceCtx,
  range: { from: string; to: string },
): Promise<AccountCoverage[]> {
  const accounts = await ctx.db.select().from(adAccounts).where(eq(adAccounts.workspaceId, ctx.workspaceId));
  const out: AccountCoverage[] = [];
  for (const a of accounts) {
    const ins = and(
      eq(insightsDaily.workspaceId, ctx.workspaceId),
      eq(insightsDaily.adAccountId, a.id),
      gte(insightsDaily.date, range.from),
      lte(insightsDaily.date, range.to),
    );
    const [cov] = await ctx.db
      .select({
        rows: sql<number>`count(*)::int`,
        days: sql<number>`count(distinct ${insightsDaily.date})::int`,
        freq: sql<number>`count(${insightsDaily.frequency})::int`,
        value: sql<number>`count(${insightsDaily.conversionValue})::int`,
        results: sql<number>`(count(*) filter (where ${insightsDaily.results} > 0))::int`,
        clicks: sql<number>`(count(*) filter (where ${insightsDaily.linkClicks} > 0))::int`,
        types: sql<
          string[]
        >`coalesce(array_agg(distinct ${insightsDaily.resultType}) filter (where ${insightsDaily.resultType} is not null), '{}')`,
      })
      .from(insightsDaily)
      .where(ins);
    const [rec] = await ctx.db
      .select({
        days: sql<number>`count(*)::int`,
        warnings: sql<number>`(count(*) filter (where ${reconciliationResults.status} = 'warning'))::int`,
        max: sql<string | null>`max(${reconciliationResults.spendDeltaPct})::text`,
      })
      .from(reconciliationResults)
      .where(
        and(
          eq(reconciliationResults.workspaceId, ctx.workspaceId),
          eq(reconciliationResults.adAccountId, a.id),
          gte(reconciliationResults.date, range.from),
          lte(reconciliationResults.date, range.to),
        ),
      );
    const ent = await ctx.db
      .select({
        type: entities.entityType,
        n: sql<number>`count(*)::int`,
        thumb: sql<number>`(count(*) filter (where ${entities.attrs}->>'thumbnail_url' is not null))::int`,
        video: sql<number>`(count(*) filter (where ${entities.attrs}->>'format' = 'VIDEO'))::int`,
        learning: sql<number>`count(${entities.learningStage})::int`,
        budget: sql<number>`count(${entities.dailyBudget})::int`,
      })
      .from(entities)
      .where(and(eq(entities.workspaceId, ctx.workspaceId), eq(entities.adAccountId, a.id)))
      .groupBy(entities.entityType);
    const byType = Object.fromEntries(ent.map((e) => [e.type, e]));
    const rows = cov?.rows ?? 0;
    const ratio = (n: number) => (rows ? Number((n / rows).toFixed(3)) : 0);
    out.push({
      adAccountId: a.id,
      name: a.name,
      metaAccountId: a.metaAccountId,
      currency: a.currency,
      timezone: a.timezone,
      daysWithData: cov?.days ?? 0,
      reconciliation: { days: rec?.days ?? 0, warningDays: rec?.warnings ?? 0, maxSpendDeltaPct: rec?.max ?? null },
      coverage: {
        frequency: ratio(cov?.freq ?? 0),
        conversionValue: ratio(cov?.value ?? 0),
        results: ratio(cov?.results ?? 0),
        linkClicks: ratio(cov?.clicks ?? 0),
      },
      resultTypes: cov?.types ?? [],
      entities: {
        campaign: byType.campaign?.n ?? 0,
        adset: byType.adset?.n ?? 0,
        ad: byType.ad?.n ?? 0,
        creative: byType.creative?.n ?? 0,
      },
      creativesWithThumbnail: byType.creative?.thumb ?? 0,
      videoCreatives: byType.creative?.video ?? 0,
      adsetsWithLearningStage: byType.adset?.learning ?? 0,
      adsetsWithBudget: byType.adset?.budget ?? 0,
    });
  }
  return out;
}

/** Bản Markdown để PM dán vào báo cáo E4. */
export function coverageMarkdown(rows: AccountCoverage[], range: { from: string; to: string }): string {
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const lines = [
    `# Báo cáo E4 — ${range.from} → ${range.to}`,
    '',
    '| Tài khoản | Ngày có dữ liệu | Ngày đối chiếu | Ngày lệch > 1% | Lệch chi tiêu lớn nhất | Tần suất | Doanh thu | Kết quả > 0 | Loại kết quả |',
    '|---|---|---|---|---|---|---|---|---|',
    ...rows.map(
      (r) =>
        `| ${r.name} (${r.metaAccountId}) | ${r.daysWithData} | ${r.reconciliation.days} | ${r.reconciliation.warningDays} | ${r.reconciliation.maxSpendDeltaPct ?? '—'}% | ${pct(r.coverage.frequency)} | ${pct(r.coverage.conversionValue)} | ${pct(r.coverage.results)} | ${r.resultTypes.join(', ') || '—'} |`,
    ),
    '',
    '| Tài khoản | Campaign | Ad set | Ad | Creative | Creative có thumbnail | Video | Ad set có learning stage | Ad set có ngân sách ngày |',
    '|---|---|---|---|---|---|---|---|---|',
    ...rows.map(
      (r) =>
        `| ${r.name} | ${r.entities.campaign} | ${r.entities.adset} | ${r.entities.ad} | ${r.entities.creative} | ${r.creativesWithThumbnail} | ${r.videoCreatives} | ${r.adsetsWithLearningStage} | ${r.adsetsWithBudget} |`,
    ),
  ];
  return lines.join('\n');
}
