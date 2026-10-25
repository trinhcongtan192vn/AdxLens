import { and, eq } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import type { Enqueue } from '@adxlens/jobs';
import { AppError, type ActorCtx } from '@adxlens/core/shared';
import { assertCan } from '@adxlens/core/tenancy';
import { getReport } from './report';
import { shareBlockReasons } from './share';

const { reports } = schema;

/** Phiên bản PDF = thời điểm dựng báo cáo: dựng lại → PDF cũ không còn đúng. */
export function pdfVersion(report: { builtAt: Date | null }): string | null {
  return report.builtAt ? String(report.builtAt.getTime()) : null;
}

/** Đường dẫn trong bucket `reports` (L3 9: `reports/{workspace}/{report}.pdf`, thêm phiên bản). */
export function pdfPathFor(workspaceId: string, reportId: string, version: string): string {
  return `${workspaceId}/${reportId}/${version}.pdf`;
}

async function assertExportable(ctx: ActorCtx, report: Awaited<ReturnType<typeof getReport>>) {
  if (report.status !== 'ready') throw new AppError('CONFLICT', 'Báo cáo chưa dựng xong');
  const block = await shareBlockReasons(ctx, report);
  if (block.blocked) {
    // ADR-0007: PDF là một đường gửi khách → cùng điều kiện với chia sẻ link.
    throw new AppError('REPORT_BLOCKED', 'Báo cáo chưa xuất PDF được', {
      unconfirmed_accounts: block.integrity.unconfirmedAccounts,
      warning_dates: block.integrity.warningDates,
      connection_revoked: block.connectionRevoked,
    });
  }
}

/** R04 "Xuất PDF": enqueue `pdf:render` (L3 10.2 `POST /reports/{id}/pdf` → 202). Đã có PDF đúng phiên bản → ready. */
export async function requestPdf(
  ctx: ActorCtx,
  reportId: string,
  deps: { enqueue: Enqueue },
): Promise<{ state: 'ready' | 'queued'; path: string }> {
  assertCan(ctx.actor, 'reports.manage');
  const report = await getReport(ctx, reportId);
  await assertExportable(ctx, report);
  const version = pdfVersion(report)!;
  const path = pdfPathFor(ctx.workspaceId, report.id, version);
  if (report.pdfPath === path) return { state: 'ready', path };
  await deps.enqueue('pdf:render', { workspaceId: ctx.workspaceId, reportId: report.id, version });
  return { state: 'queued', path };
}

/** Trạng thái PDF của phiên bản hiện tại. */
export async function pdfStatus(
  ctx: ActorCtx,
  reportId: string,
): Promise<{ state: 'none' | 'ready'; path: string | null }> {
  const report = await getReport(ctx, reportId);
  const v = pdfVersion(report);
  const path = v ? pdfPathFor(ctx.workspaceId, report.id, v) : null;
  return path && report.pdfPath === path ? { state: 'ready', path } : { state: 'none', path: null };
}

/**
 * Job `pdf:render` (worker): kiểm lại toàn vẹn + phiên bản, render qua `render(url)`, lưu Storage, ghi
 * `pdf_path`. Phiên bản đã đổi (báo cáo dựng lại) → bỏ qua.
 */
export async function renderReportPdf(
  ctx: ActorCtx,
  input: { reportId: string; version: string },
  deps: {
    printUrl: (reportId: string) => string;
    render: (url: string) => Promise<Uint8Array>;
    upload: (path: string, bytes: Uint8Array) => Promise<void>;
  },
): Promise<'done' | 'stale' | 'blocked'> {
  const report = await getReport(ctx, input.reportId);
  if (pdfVersion(report) !== input.version) return 'stale';
  try {
    await assertExportable(ctx, report);
  } catch (e) {
    if (e instanceof AppError && e.code === 'REPORT_BLOCKED') return 'blocked';
    throw e;
  }
  const bytes = await deps.render(deps.printUrl(report.id));
  const path = pdfPathFor(ctx.workspaceId, report.id, input.version);
  await deps.upload(path, bytes);
  await ctx.db
    .update(reports)
    .set({ pdfPath: path })
    .where(and(eq(reports.workspaceId, ctx.workspaceId), eq(reports.id, report.id)));
  return 'done';
}
