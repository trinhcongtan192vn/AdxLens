import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import type { DbOrTx } from '@adxlens/db';
import { schema } from '@adxlens/db';
import { systemClock, type Clock } from '@adxlens/core/shared';

const { deletionRequests, workspaces, actions, adAccounts, circuitBreakers, automationRules } = schema;

/**
 * Yêu cầu xóa dữ liệu mọi workspace (staff, chính sách Meta): mã, nguồn, trạng thái, hạn xóa, **quá hạn** khi đã qua
 * hạn mà chưa xong. XUYÊN WORKSPACE có chủ đích (CLAUDE.md quy tắc 1): chỉ route staff gọi.
 */
export async function deletionRequestsOverview(db: DbOrTx, clock: Clock = systemClock) {
  const now = clock.now();
  const rows = await db
    .select({
      id: deletionRequests.id,
      workspaceId: deletionRequests.workspaceId,
      workspaceName: workspaces.name,
      code: deletionRequests.code,
      source: deletionRequests.source,
      status: deletionRequests.status,
      purgeAfter: deletionRequests.purgeAfter,
      completedAt: deletionRequests.completedAt,
    })
    .from(deletionRequests)
    .leftJoin(workspaces, eq(workspaces.id, deletionRequests.workspaceId))
    .orderBy(desc(deletionRequests.purgeAfter))
    .limit(300);
  return rows.map((r) => ({
    ...r,
    overdue:
      (r.status === 'pending' || r.status === 'in_progress') && r.purgeAfter.getTime() < now.getTime() - 86_400_000,
  }));
}

/**
 * Thực thi trên mọi workspace (staff, chỉ đọc): hành động 7 ngày gần nhất (đếm theo trạng thái + danh sách lỗi),
 * breaker đang mở, rule đang chạy thật. Không trả token hay tham số ghi Meta ngoài loại hành động. Xuyên workspace có
 * chủ đích: chỉ route staff gọi.
 */
export async function executionOverview(db: DbOrTx, clock: Clock = systemClock) {
  const since = new Date(clock.now().getTime() - 7 * 86_400_000);
  const [counts, failed, breakers, liveRules] = await Promise.all([
    db
      .select({ status: actions.status, tier: actions.tier, n: sql<number>`count(*)::int` })
      .from(actions)
      .where(gte(actions.createdAt, since))
      .groupBy(actions.status, actions.tier),
    db
      .select({
        id: actions.id,
        workspaceId: actions.workspaceId,
        workspaceName: workspaces.name,
        accountName: adAccounts.name,
        actionType: actions.actionType,
        targetName: actions.targetName,
        tier: actions.tier,
        resultCode: actions.resultCode,
        createdAt: actions.createdAt,
      })
      .from(actions)
      .innerJoin(workspaces, eq(workspaces.id, actions.workspaceId))
      .innerJoin(adAccounts, eq(adAccounts.id, actions.adAccountId))
      .where(and(gte(actions.createdAt, since), inArray(actions.status, ['failed'])))
      .orderBy(desc(actions.createdAt))
      .limit(50),
    db
      .select({
        adAccountId: circuitBreakers.adAccountId,
        workspaceId: circuitBreakers.workspaceId,
        workspaceName: workspaces.name,
        accountName: adAccounts.name,
        consecutiveFailures: circuitBreakers.consecutiveFailures,
        openedAt: circuitBreakers.openedAt,
      })
      .from(circuitBreakers)
      .innerJoin(workspaces, eq(workspaces.id, circuitBreakers.workspaceId))
      .innerJoin(adAccounts, eq(adAccounts.id, circuitBreakers.adAccountId))
      .where(eq(circuitBreakers.open, true))
      .orderBy(desc(circuitBreakers.openedAt)),
    db
      .select({
        id: automationRules.id,
        workspaceId: automationRules.workspaceId,
        workspaceName: workspaces.name,
        accountName: adAccounts.name,
        name: automationRules.name,
        templateKey: automationRules.templateKey,
        liveSince: automationRules.liveSince,
      })
      .from(automationRules)
      .innerJoin(workspaces, eq(workspaces.id, automationRules.workspaceId))
      .innerJoin(adAccounts, eq(adAccounts.id, automationRules.adAccountId))
      .where(eq(automationRules.mode, 'live'))
      .orderBy(desc(automationRules.liveSince)),
  ]);
  return { since, counts, failed, breakers, liveRules };
}
