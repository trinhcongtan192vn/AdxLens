import { z } from 'zod';
import { reconciliationBoard } from '@adxlens/core/ops';
import { route } from '@/server/route';

/** Bảng đối chiếu toàn hệ thống (staff): ngày lệch > 1%, chặn chia sẻ, đối chiếu trễ. Không trả chi tiêu. */
export const GET = route({
  auth: 'staff',
  query: z.object({
    days: z.coerce.number().int().min(1).max(90).optional(),
    issues: z.enum(['1', '0']).optional(),
  }),
  handler: async (ctx, { query }) => ({
    items: (await reconciliationBoard(ctx.db, { days: query.days, onlyIssues: query.issues === '1' })).map((r) => ({
      ad_account_id: r.adAccountId,
      workspace_id: r.workspaceId,
      workspace_name: r.workspaceName,
      account_name: r.accountName,
      meta_account_id: r.metaAccountId,
      client_name: r.clientName,
      assignment_status: r.assignmentStatus,
      days_checked: r.daysChecked,
      warning_days: r.warningDays,
      warning_dates: r.warningDates,
      max_spend_delta_pct: r.maxSpendDeltaPct,
      max_results_delta_pct: r.maxResultsDeltaPct,
      last_checked_at: r.lastCheckedAt,
      share_blocked: r.shareBlocked,
      stale: r.stale,
    })),
  }),
});
