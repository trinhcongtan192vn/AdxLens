import { and, eq, inArray, sql } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import type { I18nText } from '@adxlens/db/schema';
import type { WorkspaceCtx } from '@adxlens/core/shared';
import type { DateRange } from './metrics';

const { actions, adAccounts, recommendations, findings } = schema;

/** Số dòng tối đa mỗi nhóm trong báo cáo (đủ để chứng minh, không làm báo cáo dài). */
export const AGENCY_WORK_LIMIT = 15;

export type AgencyWork = {
  /** Thay đổi trên Meta đã thực hiện và xác minh (qua Execution Gateway) trong kỳ. */
  actions: {
    date: string;
    accountId: string;
    actionType: string;
    targetName: string | null;
    tier: 'approve' | 'auto';
    undone: boolean;
    beforeState: Record<string, string | null>;
    afterExpected: Record<string, string | null>;
    currency: string;
  }[];
  /** Việc tuần này đã đánh dấu xong trong kỳ. */
  tasks: { date: string; accountId: string; entityName: string | null; action: I18nText }[];
  /** Số phát hiện agency đã xử lý / tự hết trong kỳ. */
  findingsHandled: number;
  totals: { actions: number; tasks: number };
};

/**
 * "Agency đã làm gì trong kỳ" (roadmap A2): tổng hợp TỰ ĐỘNG từ nhật ký hành động, Việc tuần này đã xong và phát
 * hiện đã xử lý, theo ngày của múi giờ từng tài khoản. Chỉ đọc dữ liệu của workspace hiện tại và các tài khoản truyền
 * vào (đã lọc theo Client). Không tạo số mới — chỉ đếm và liệt kê việc đã ghi lại.
 */
export async function agencyWork(
  ctx: WorkspaceCtx,
  accountIds: string[],
  period: DateRange,
): Promise<AgencyWork | null> {
  if (!accountIds.length) return null;
  const localDay = (col: unknown) => sql<string>`((${col} at time zone ${adAccounts.timezone})::date)::text`;
  const inPeriod = (col: unknown) =>
    sql`(${col} at time zone ${adAccounts.timezone})::date between ${period.from}::date and ${period.to}::date`;

  const [acts, tasks, [handled]] = await Promise.all([
    ctx.db
      .select({
        date: localDay(actions.executedAt),
        accountId: actions.adAccountId,
        actionType: actions.actionType,
        targetName: actions.targetName,
        tier: actions.tier,
        status: actions.status,
        beforeState: actions.beforeState,
        afterExpected: actions.afterExpected,
        currency: adAccounts.currency,
      })
      .from(actions)
      .innerJoin(adAccounts, eq(adAccounts.id, actions.adAccountId))
      .where(
        and(
          eq(actions.workspaceId, ctx.workspaceId),
          inArray(actions.adAccountId, accountIds),
          inArray(actions.status, ['success', 'undone']),
          sql`${actions.undoOf} is null`,
          sql`${actions.executedAt} is not null`,
          inPeriod(actions.executedAt),
        ),
      )
      .orderBy(actions.executedAt),
    ctx.db
      .select({
        date: localDay(recommendations.doneAt),
        accountId: recommendations.adAccountId,
        entityName: recommendations.entityName,
        action: recommendations.action,
      })
      .from(recommendations)
      .innerJoin(adAccounts, eq(adAccounts.id, recommendations.adAccountId))
      .where(
        and(
          eq(recommendations.workspaceId, ctx.workspaceId),
          inArray(recommendations.adAccountId, accountIds),
          eq(recommendations.status, 'done'),
          sql`${recommendations.doneAt} is not null`,
          inPeriod(recommendations.doneAt),
        ),
      )
      .orderBy(recommendations.doneAt),
    ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(findings)
      .innerJoin(adAccounts, eq(adAccounts.id, findings.adAccountId))
      .where(
        and(
          eq(findings.workspaceId, ctx.workspaceId),
          inArray(findings.adAccountId, accountIds),
          inArray(findings.status, ['done', 'resolved']),
          inPeriod(findings.updatedAt),
        ),
      ),
  ]);
  const findingsHandled = handled?.n ?? 0;
  if (!acts.length && !tasks.length && !findingsHandled) return null;
  return {
    actions: acts.slice(-AGENCY_WORK_LIMIT).map((a) => ({
      date: a.date,
      accountId: a.accountId,
      actionType: a.actionType,
      targetName: a.targetName,
      tier: a.tier,
      undone: a.status === 'undone',
      beforeState: a.beforeState,
      afterExpected: a.afterExpected,
      currency: a.currency,
    })),
    tasks: tasks.slice(-AGENCY_WORK_LIMIT),
    findingsHandled,
    totals: { actions: acts.length, tasks: tasks.length },
  };
}
