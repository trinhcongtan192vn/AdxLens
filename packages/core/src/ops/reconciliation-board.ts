import { and, desc, eq, sql } from 'drizzle-orm';
import type { DbOrTx } from '@adxlens/db';
import { schema } from '@adxlens/db';
import { addDays, localDate, systemClock, type Clock } from '@adxlens/core/shared';

const { adAccounts, metaConnections, workspaces, clients } = schema;

/** Tài khoản chưa đối chiếu lại quá số ngày này coi là "đối chiếu trễ". */
export const RECON_STALE_DAYS = 3;

export type ReconBoardRow = {
  adAccountId: string;
  workspaceId: string;
  workspaceName: string;
  accountName: string;
  metaAccountId: string;
  clientName: string | null;
  assignmentStatus: string;
  daysChecked: number;
  warningDays: number;
  warningDates: string[];
  /** Độ lệch lớn nhất (%) trong kỳ, chuỗi decimal từ DB (không đổi sang float). */
  maxSpendDeltaPct: string | null;
  maxResultsDeltaPct: string | null;
  lastCheckedAt: Date | null;
  /** Cùng quy tắc chặn chia sẻ của báo cáo (ADR-0007): có ngày lệch > 1% hoặc gán chưa xác nhận. */
  shareBlocked: boolean;
  stale: boolean;
};

/**
 * Bảng đối chiếu toàn hệ thống (E4 trên giao diện admin): mỗi tài khoản QC thật (bỏ kết nối đã ngắt và dữ liệu mẫu)
 * với số ngày lệch > 1% trong `days` ngày gần nhất. Ngưỡng là `status` đã tính bởi core/reconciliation (không tính
 * lại ở đây). XUYÊN WORKSPACE có chủ đích (CLAUDE.md quy tắc 1): chỉ route staff gọi; không trả chi tiêu.
 */
export async function reconciliationBoard(
  db: DbOrTx,
  opts: { days?: number; onlyIssues?: boolean } = {},
  clock: Clock = systemClock,
): Promise<ReconBoardRow[]> {
  const days = Math.min(Math.max(opts.days ?? 7, 1), 90);
  const since = addDays(localDate(clock.now(), 'UTC'), -days);
  const rows = await db
    .select({
      adAccountId: adAccounts.id,
      workspaceId: adAccounts.workspaceId,
      workspaceName: workspaces.name,
      accountName: adAccounts.name,
      metaAccountId: adAccounts.metaAccountId,
      clientName: clients.name,
      assignmentStatus: adAccounts.assignmentStatus,
      daysChecked: sql<number>`(select count(*)::int from app.reconciliation_results r
        where r.ad_account_id = "app"."ad_accounts"."id" and r.date >= ${since})`,
      warningDates: sql<
        string[]
      >`coalesce((select array_agg(r.date::text order by r.date) from app.reconciliation_results r
        where r.ad_account_id = "app"."ad_accounts"."id" and r.date >= ${since} and r.status = 'warning'), '{}')`,
      maxSpendDeltaPct: sql<string | null>`(select max(abs(r.spend_delta_pct))::text from app.reconciliation_results r
        where r.ad_account_id = "app"."ad_accounts"."id" and r.date >= ${since})`,
      maxResultsDeltaPct: sql<
        string | null
      >`(select max(abs(r.results_delta_pct))::text from app.reconciliation_results r
        where r.ad_account_id = "app"."ad_accounts"."id" and r.date >= ${since})`,
      lastCheckedAt: sql<string | null>`(select max(r.checked_at) from app.reconciliation_results r
        where r.ad_account_id = "app"."ad_accounts"."id")`,
    })
    .from(adAccounts)
    .innerJoin(metaConnections, eq(metaConnections.id, adAccounts.connectionId))
    .innerJoin(workspaces, eq(workspaces.id, adAccounts.workspaceId))
    .leftJoin(clients, eq(clients.id, adAccounts.clientId))
    .where(and(sql`${metaConnections.status} <> 'revoked'`, eq(metaConnections.isDemo, false)))
    .orderBy(desc(workspaces.createdAt), adAccounts.name)
    .limit(1000);

  const staleBefore = clock.now().getTime() - RECON_STALE_DAYS * 86_400_000;
  const out = rows.map((r): ReconBoardRow => {
    const lastCheckedAt = r.lastCheckedAt ? new Date(r.lastCheckedAt) : null;
    const warningDates = r.warningDates ?? [];
    return {
      ...r,
      lastCheckedAt,
      warningDates,
      warningDays: warningDates.length,
      shareBlocked: warningDates.length > 0 || r.assignmentStatus !== 'confirmed',
      stale: !lastCheckedAt || lastCheckedAt.getTime() < staleBefore,
    };
  });
  const filtered = opts.onlyIssues ? out.filter((r) => r.shareBlocked || r.stale) : out;
  return filtered.sort((a, b) => b.warningDays - a.warningDays || Number(b.stale) - Number(a.stale));
}
