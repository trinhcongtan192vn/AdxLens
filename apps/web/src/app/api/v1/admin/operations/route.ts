import { metaApiUsage, syncIssues } from '@adxlens/core/ops';
import { queueAdmin } from '@/server/queue-admin';
import { route } from '@/server/route';

/** Trang vận hành (staff): đồng bộ lỗi / kẹt, số job theo queue, mức dùng Meta API 60 phút. */
export const GET = route({
  auth: 'staff',
  handler: async (ctx) => {
    const [syncs, queues, meta] = await Promise.all([syncIssues(ctx.db), queueAdmin().counts(), metaApiUsage(ctx.db)]);
    return {
      sync_issues: syncs.map((s) => ({
        id: s.id,
        workspace_id: s.workspaceId,
        workspace_name: s.workspaceName,
        ad_account_id: s.adAccountId,
        account_name: s.accountName,
        meta_account_id: s.metaAccountId,
        kind: s.kind,
        status: s.status,
        date_from: s.dateFrom,
        date_to: s.dateTo,
        error: s.error,
        started_at: s.startedAt,
        finished_at: s.finishedAt,
      })),
      queues,
      meta_usage: {
        since: meta.since,
        calls: meta.calls,
        errors: meta.errors,
        rate_limited: meta.rateLimited,
        avg_ms: meta.avgMs,
        top: meta.top.map((w) => ({
          workspace_id: w.workspaceId,
          workspace_name: w.workspaceName,
          calls: w.calls,
          rate_limited: w.rateLimited,
        })),
      },
    };
  },
});
