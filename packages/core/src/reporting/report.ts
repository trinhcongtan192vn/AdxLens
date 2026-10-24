import { and, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import type { I18nText, ReportEdits, ReportIntegrity } from '@adxlens/db/schema';
import type { Enqueue } from '@adxlens/jobs';
import { listAdAccounts } from '@adxlens/core/connections';
import { healthScores, listFindings } from '@adxlens/core/insight';
import { accountReconciliation } from '@adxlens/core/reconciliation';
import {
  addDays,
  AppError,
  daysBetween,
  notFound,
  sumDecimal,
  systemClock,
  type ActorCtx,
  type Clock,
} from '@adxlens/core/shared';
import { assertCan, getClient } from '@adxlens/core/tenancy';
import { getClientGoal, vsTarget } from './goals';
import { metricValues } from './metric-catalog';
import { agencyWork, type AgencyWork } from './agency-work';
import { explainCpaChange, type CpaChange } from './cpa-change';
import { breakdownTable, topAds, type BreakdownRow, type TopAd } from './report-extras';
import { accountKpis, dailySeries, entityTable, type DateRange, type Kpis } from './metrics';
import { generateSummary, type LlmClient } from './summary';

const { reports, reconciliationResults, workspaces, clients } = schema;

export const TEMPLATE_VERSION = 'v1';
export const MAX_REPORT_DAYS = 92;
export const REPORT_FINDINGS_LIMIT = 10;
/** Báo cáo audit là nội dung kiểm tra tài khoản: liệt kê đủ phát hiện đang mở hơn báo cáo định kỳ. */
export const REPORT_AUDIT_FINDINGS_LIMIT = 30;
export const REPORT_TOP_CAMPAIGNS = 5;

export type ReportContent = {
  version: 1;
  client: { id: string; name: string };
  brand: { displayName: string; logoPath: string | null; primaryColor: string | null };
  locale: 'vi' | 'en';
  kind: 'audit' | 'periodic' | 'pitch';
  period: DateRange;
  compare: DateRange;
  generatedAt: string;
  /** Dữ liệu mẫu (S01): báo cáo ghi rõ là số liệu minh họa. */
  demo?: boolean;
  /** P0-13: "khớp Meta tính đến …", attribution, múi giờ, tiền tệ. */
  source: { matchedAt: string | null; attribution: '7d_click_1d_view'; currencies: string[]; timezones: string[] };
  accounts: {
    id: string;
    name: string;
    metaAccountId: string;
    currency: string;
    timezone: string;
    kpis: Kpis;
    prevKpis: Kpis;
    daily: { date: string; spend: string; results: number }[];
    health: number;
    /** Báo cáo audit: điểm trừ theo từng nhóm quy tắc (health không là hộp đen — L2 5.3). */
    healthComponents?: { group: string; penalty: number; findings: number }[];
    reconciliation: { status: 'ok' | 'warning' | 'pending'; maxSpendDeltaPct: string | null };
    topCampaigns: { name: string | null; spend: string; results: number; cpa: string | null; roas: string | null }[];
    /** A1: vì sao CPA thay đổi so với kỳ trước (null = không đủ dữ liệu / gần như không đổi). */
    cpaChange?: CpaChange | null;
    /** A4: theo nhóm (tuổi-giới tính, vị trí, khu vực) và top quảng cáo kèm thumbnail. */
    breakdowns?: { age_gender: BreakdownRow[]; placement: BreakdownRow[]; region: BreakdownRow[] };
    topAds?: TopAd[];
  }[];
  findings: {
    accountId: string;
    ruleId: string;
    ruleGroup?: string;
    severity: 'low' | 'medium' | 'high';
    entityName: string | null;
    why: I18nText;
    whatToDo: I18nText;
    impact: { amount: string; currency: string } | null;
  }[];
  /**
   * ADR-0017: mục tiêu KPI của Client so với thực tế kỳ báo cáo (chỉ khi Client đã đặt mục tiêu). Số do code tính trên
   * các tài khoản cùng tiền tệ mục tiêu; báo cáo cũ không có trường này.
   */
  goal?: {
    metric: string;
    target: string;
    currency: string | null;
    actual: string | null;
    previous: string | null;
    /** % tốt hơn (+) / kém hơn (−) mục tiêu theo hướng tốt của chỉ số. */
    vsTargetPct: number | null;
    secondary: { metric: string; actual: string | null; previous: string | null }[];
  } | null;
  /** A2: việc agency đã làm trong kỳ, tổng hợp tự động (báo cáo cũ không có trường này). */
  agencyWork?: AgencyWork | null;
  /** Báo cáo audit: số phát hiện theo mức độ và tổng tác động ước tính theo tiền tệ (cộng decimal). */
  audit?: {
    counts: { high: number; medium: number; low: number };
    impact: { currency: string; amount: string }[];
  } | null;
};

/** Tổng hợp cho báo cáo audit: đếm theo mức độ, cộng tác động ước tính theo từng tiền tệ (không qua số thực). */
export function auditTotals(items: ReportContent['findings']): NonNullable<ReportContent['audit']> {
  const counts = { high: 0, medium: 0, low: 0 };
  const byCur = new Map<string, string[]>();
  for (const f of items) {
    counts[f.severity] += 1;
    if (f.impact) byCur.set(f.impact.currency, [...(byCur.get(f.impact.currency) ?? []), f.impact.amount]);
  }
  return {
    counts,
    impact: [...byCur].map(([currency, amounts]) => ({ currency, amount: sumDecimal(amounts) })),
  };
}

/** Kỳ so sánh liền trước cùng độ dài. */
export function compareRange(r: DateRange): DateRange {
  const len = daysBetween(r.from, r.to) + 1;
  return { from: addDays(r.from, -len), to: addDays(r.from, -1) };
}

async function clientAccounts(ctx: ActorCtx, clientId: string) {
  return (await listAdAccounts(ctx)).filter((a) => a.clientId === clientId && a.connectionStatus !== 'revoked');
}

/**
 * Toàn vẹn của Client trong kỳ (ADR-0007, BR01, P0-14/P0-24): tài khoản chưa xác nhận gán, ngày đối chiếu
 * lệch > 1% trong kỳ. Dùng lúc dựng (ghi vào báo cáo) và lúc chia sẻ/gửi (kiểm lại).
 */
export async function reportIntegrity(ctx: ActorCtx, clientId: string, range: DateRange): Promise<ReportIntegrity> {
  const accs = await clientAccounts(ctx, clientId);
  const unconfirmedAccounts = accs.filter((a) => a.assignmentStatus !== 'confirmed').map((a) => a.id);
  const ids = accs.map((a) => a.id);
  const warn = ids.length
    ? await ctx.db
        .select({ id: reconciliationResults.adAccountId, date: reconciliationResults.date })
        .from(reconciliationResults)
        .where(
          and(
            eq(reconciliationResults.workspaceId, ctx.workspaceId),
            inArray(reconciliationResults.adAccountId, ids),
            eq(reconciliationResults.status, 'warning'),
            gte(reconciliationResults.date, range.from),
            lte(reconciliationResults.date, range.to),
          ),
        )
        .orderBy(reconciliationResults.date)
    : [];
  const byAcc = new Map<string, string[]>();
  for (const w of warn) byAcc.set(w.id, [...(byAcc.get(w.id) ?? []), w.date]);
  return { unconfirmedAccounts, warningDates: [...byAcc].map(([adAccountId, dates]) => ({ adAccountId, dates })) };
}

export function isBlocked(i: ReportIntegrity | null | undefined): boolean {
  return !i || i.unconfirmedAccounts.length > 0 || i.warningDates.length > 0;
}

/** R02: tạo báo cáo (bất đồng bộ) — dựng nội dung ở job `report:build`. */
export async function createReport(
  ctx: ActorCtx,
  input: { clientId: string; kind: 'audit' | 'periodic'; from: string; to: string; locale?: 'vi' | 'en' },
  deps: { enqueue: Enqueue },
): Promise<{ id: string }> {
  assertCan(ctx.actor, 'reports.manage');
  const client = await getClient(ctx, input.clientId);
  if (client.archivedAt) throw notFound('Client');
  if (input.from > input.to || daysBetween(input.from, input.to) + 1 > MAX_REPORT_DAYS) {
    throw new AppError('VALIDATION_FAILED', 'Khoảng ngày không hợp lệ', { max_days: MAX_REPORT_DAYS });
  }
  const [ws] = await ctx.db
    .select({ locale: workspaces.defaultLocale })
    .from(workspaces)
    .where(eq(workspaces.id, ctx.workspaceId));
  const locale = input.locale ?? (client.reportLocale as 'vi' | 'en' | null) ?? (ws?.locale === 'en' ? 'en' : 'vi');
  const [r] = await ctx.db
    .insert(reports)
    .values({
      workspaceId: ctx.workspaceId,
      clientId: client.id,
      kind: input.kind,
      dateFrom: input.from,
      dateTo: input.to,
      locale,
      templateVersion: TEMPLATE_VERSION,
      createdBy: ctx.actor.userId,
    })
    .returning({ id: reports.id });
  await deps.enqueue('report:build', { workspaceId: ctx.workspaceId, reportId: r!.id });
  return { id: r!.id };
}

/**
 * Job `report:build`: dựng `ReportContent` từ số liệu đã đồng bộ (không LLM ở đây — tóm tắt ở 020),
 * ghi trạng thái toàn vẹn lúc dựng. Lỗi → `failed` kèm mã.
 */
export async function buildReport(
  ctx: ActorCtx,
  reportId: string,
  clock: Clock = systemClock,
  deps: { llm?: LlmClient | null } = {},
): Promise<'ready' | 'failed'> {
  const r = await getReport(ctx, reportId);
  try {
    const client = await getClient(ctx, r.clientId);
    const [ws] = await ctx.db.select().from(workspaces).where(eq(workspaces.id, ctx.workspaceId));
    const brand = { ...(ws?.brand ?? {}), ...(client.brandOverride ?? {}) };
    const period = { from: r.dateFrom, to: r.dateTo };
    const compare = compareRange(period);
    const accs = await clientAccounts(ctx, client.id);
    const isAudit = r.kind === 'audit';
    const findingsLimit = isAudit ? REPORT_AUDIT_FINDINGS_LIMIT : REPORT_FINDINGS_LIMIT;
    const ids = accs.map((a) => a.id);
    const [kc, kp, health, recon] = await Promise.all([
      accountKpis(ctx, ids, period),
      accountKpis(ctx, ids, compare),
      healthScores(ctx, ids),
      accountReconciliation(ctx, ids, clock),
    ]);
    const accounts: ReportContent['accounts'] = [];
    const findingsOut: ReportContent['findings'] = [];
    for (const a of accs) {
      const [daily, camps, prevCamps, f, ageGender, placement, region, ads] = await Promise.all([
        dailySeries(ctx, [a.id], period),
        entityTable(ctx, [a.id], 'campaign', period),
        entityTable(ctx, [a.id], 'campaign', compare),
        listFindings(ctx, a.id, { limit: findingsLimit }),
        breakdownTable(ctx, [a.id], period, 'age_gender'),
        breakdownTable(ctx, [a.id], period, 'placement'),
        breakdownTable(ctx, [a.id], period, 'region'),
        topAds(ctx, [a.id], period),
      ]);
      accounts.push({
        id: a.id,
        name: a.name,
        metaAccountId: a.metaAccountId,
        currency: a.currency,
        timezone: a.timezone,
        kpis: kc.get(a.id)!,
        prevKpis: kp.get(a.id)!,
        daily: daily.map((d) => ({ date: d.date, spend: d.spend, results: d.results })),
        health: health.get(a.id)?.score ?? 100,
        ...(isAudit ? { healthComponents: health.get(a.id)?.components ?? [] } : {}),
        reconciliation: recon.get(a.id) ?? { status: 'pending', maxSpendDeltaPct: null },
        topCampaigns: camps
          .filter((c) => Number(c.kpis.spend) > 0)
          .slice(0, REPORT_TOP_CAMPAIGNS)
          .map((c) => ({
            name: c.name,
            spend: c.kpis.spend,
            results: c.kpis.results,
            cpa: c.kpis.cpa,
            roas: c.kpis.roas,
          })),
        cpaChange: explainCpaChange(kc.get(a.id)!, kp.get(a.id)!, { current: camps, previous: prevCamps }),
        breakdowns: { age_gender: ageGender, placement, region },
        topAds: ads,
      });
      for (const x of f.items) {
        findingsOut.push({
          accountId: a.id,
          ruleId: x.ruleId,
          ruleGroup: x.ruleGroup,
          severity: x.severity,
          entityName: x.entityName,
          why: x.explanation.why,
          whatToDo: x.explanation.whatToDo,
          impact: x.impactEstimate ? { amount: x.impactEstimate, currency: a.currency } : null,
        });
      }
    }
    const rank = { high: 3, medium: 2, low: 1 } as const;
    findingsOut.sort(
      (x, y) => rank[y.severity] - rank[x.severity] || Number(y.impact?.amount ?? 0) - Number(x.impact?.amount ?? 0),
    );
    const [matched] = ids.length
      ? await ctx.db
          .select({ at: sql<Date | null>`max(${reconciliationResults.checkedAt})` })
          .from(reconciliationResults)
          .where(
            and(
              eq(reconciliationResults.workspaceId, ctx.workspaceId),
              inArray(reconciliationResults.adAccountId, ids),
            ),
          )
      : [{ at: null }];
    const content: ReportContent = {
      version: 1,
      client: { id: client.id, name: client.name },
      brand: {
        displayName: brand.display_name || ws?.name || '',
        logoPath: brand.logo_path ?? null,
        primaryColor: brand.primary_color ?? null,
      },
      locale: r.locale === 'en' ? 'en' : 'vi',
      kind: r.kind,
      period,
      compare,
      generatedAt: clock.now().toISOString(),
      demo: accs.some((a) => a.isDemo),
      source: {
        matchedAt: matched?.at ? new Date(matched.at).toISOString() : null,
        attribution: '7d_click_1d_view',
        currencies: [...new Set(accs.map((a) => a.currency))],
        timezones: [...new Set(accs.map((a) => a.timezone))],
      },
      accounts,
      findings: findingsOut.slice(0, findingsLimit),
      // Audit là ảnh chụp sức khỏe tài khoản (cả khi pitch khách mới) — không kèm "việc agency đã làm".
      agencyWork: isAudit ? null : await agencyWork(ctx, ids, period),
      goal: await reportGoal(ctx, client.id, accs, period, compare),
      audit: isAudit ? auditTotals(findingsOut.slice(0, findingsLimit)) : null,
    };
    const integrity = await reportIntegrity(ctx, client.id, period);
    // Tóm tắt (P0-16): LLM chỉ diễn giải số đã tính; không qua kiểm tra số → tóm tắt mẫu.
    const summary = await generateSummary(content, { llm: deps.llm });
    await ctx.db
      .update(reports)
      .set({
        status: 'ready',
        content,
        integrity,
        reconciliationStatus: integrity.warningDates.length ? 'warning' : 'ok',
        builtAt: clock.now(),
        summaryText: summary.text,
        summarySource: summary.source,
        error: null,
      })
      .where(and(eq(reports.workspaceId, ctx.workspaceId), eq(reports.id, r.id)));
    return 'ready';
  } catch (e) {
    await ctx.db
      .update(reports)
      .set({ status: 'failed', error: e instanceof AppError ? e.code : 'BUILD_FAILED' })
      .where(and(eq(reports.workspaceId, ctx.workspaceId), eq(reports.id, r.id)));
    return 'failed';
  }
}

/** Báo cáo trong workspace; buyer chỉ thấy báo cáo của Client được gán. */
export async function getReport(ctx: ActorCtx, reportId: string) {
  const [r] = await ctx.db
    .select()
    .from(reports)
    .where(and(eq(reports.workspaceId, ctx.workspaceId), eq(reports.id, reportId)));
  if (!r) throw notFound('Báo cáo');
  await getClient(ctx, r.clientId); // quyền theo Client
  return r;
}

/** R01: danh sách báo cáo (mới nhất trước), lọc theo Client. */
export async function listReports(ctx: ActorCtx, opts: { clientId?: string; limit?: number } = {}) {
  const rows = await ctx.db
    .select({
      id: reports.id,
      clientId: reports.clientId,
      clientName: clients.name,
      kind: reports.kind,
      dateFrom: reports.dateFrom,
      dateTo: reports.dateTo,
      locale: reports.locale,
      status: reports.status,
      reconciliationStatus: reports.reconciliationStatus,
      integrity: reports.integrity,
      edits: reports.edits,
      createdAt: reports.createdAt,
    })
    .from(reports)
    .innerJoin(clients, eq(clients.id, reports.clientId))
    .where(
      and(
        eq(reports.workspaceId, ctx.workspaceId),
        opts.clientId ? eq(reports.clientId, opts.clientId) : undefined,
        isNull(clients.archivedAt),
      ),
    )
    .orderBy(desc(reports.createdAt))
    .limit(opts.limit ?? 100);
  const full = ctx.actor.role === 'owner' || (ctx.actor.role === 'manager' && ctx.actor.clientAccess.length === 0);
  return full ? rows : rows.filter((r) => ctx.actor.clientAccess.includes(r.clientId));
}

/** R03: phần agency tự viết (tiêu đề, việc đã làm, kế hoạch, ẩn mục). */
export async function updateReportEdits(ctx: ActorCtx, reportId: string, edits: ReportEdits) {
  assertCan(ctx.actor, 'reports.manage');
  const r = await getReport(ctx, reportId);
  const clean = (s: string | undefined, max: number) => (s === undefined ? undefined : s.trim().slice(0, max));
  const next: ReportEdits = {
    ...r.edits,
    ...(edits.title !== undefined ? { title: clean(edits.title, 160) } : {}),
    ...(edits.intro !== undefined ? { intro: clean(edits.intro, 2000) } : {}),
    ...(edits.workDone !== undefined ? { workDone: clean(edits.workDone, 4000) } : {}),
    ...(edits.nextSteps !== undefined ? { nextSteps: clean(edits.nextSteps, 4000) } : {}),
    ...(edits.hiddenSections !== undefined ? { hiddenSections: edits.hiddenSections.slice(0, 20) } : {}),
  };
  await ctx.db
    .update(reports)
    .set({ edits: next })
    .where(and(eq(reports.workspaceId, ctx.workspaceId), eq(reports.id, r.id)));
  return next;
}

/** Dựng lại (sau khi xác nhận gán / đối chiếu lại). */
export async function rebuildReport(ctx: ActorCtx, reportId: string, deps: { enqueue: Enqueue }) {
  assertCan(ctx.actor, 'reports.manage');
  const r = await getReport(ctx, reportId);
  await ctx.db
    .update(reports)
    .set({ status: 'building', error: null })
    .where(and(eq(reports.workspaceId, ctx.workspaceId), eq(reports.id, r.id)));
  await deps.enqueue('report:build', { workspaceId: ctx.workspaceId, reportId: r.id });
}

/** Xóa báo cáo (share link đi theo — cascade). */
export async function deleteReport(ctx: ActorCtx, reportId: string) {
  assertCan(ctx.actor, 'reports.manage');
  const r = await getReport(ctx, reportId);
  await ctx.db.delete(reports).where(and(eq(reports.workspaceId, ctx.workspaceId), eq(reports.id, r.id)));
}

/** Khối "Mục tiêu" của báo cáo (ADR-0017): mục tiêu chính + chỉ số phụ, kỳ này và kỳ trước. */
async function reportGoal(
  ctx: ActorCtx,
  clientId: string,
  accs: { id: string; currency: string }[],
  period: DateRange,
  compare: DateRange,
): Promise<ReportContent['goal']> {
  const g = await getClientGoal(ctx, clientId);
  if (!g?.primaryMetric || !g.primaryTarget) return null;
  const ids = accs.filter((a) => !g.currency || a.currency === g.currency).map((a) => a.id);
  if (!ids.length) return null;
  const [cur, prev] = await Promise.all([metricValues(ctx, ids, period), metricValues(ctx, ids, compare)]);
  return {
    metric: g.primaryMetric,
    target: g.primaryTarget,
    currency: g.currency,
    actual: cur[g.primaryMetric],
    previous: prev[g.primaryMetric],
    vsTargetPct: vsTarget(g.primaryMetric, cur[g.primaryMetric], g.primaryTarget),
    secondary: g.secondaryMetrics.map((m) => ({ metric: m, actual: cur[m], previous: prev[m] })),
  };
}
