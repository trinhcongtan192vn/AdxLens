import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { DbOrTx } from '@adxlens/db';
import { schema } from '@adxlens/db';
import { billingStatus } from '@adxlens/core/billing';
import { notFound } from '@adxlens/core/shared';

const {
  workspaces,
  memberships,
  users,
  metaConnections,
  adAccounts,
  clients,
  syncRuns,
  reconciliationResults,
  featureFlags,
  opsIncidents,
  deletionRequests,
} = schema;

/**
 * Tìm workspace cho hỗ trợ khách (trang admin, ADR-0013): theo tên workspace hoặc email thành viên. XUYÊN WORKSPACE
 * có chủ đích (CLAUDE.md quy tắc 1): chỉ route `auth: 'staff'` gọi; chỉ trả thông tin vận hành.
 */
export async function searchWorkspaces(db: DbOrTx, q: string, limit = 50) {
  const term = `%${q.trim()}%`;
  return db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      createdAt: workspaces.createdAt,
      ownerEmail: sql<string | null>`(select u.email from app.memberships m join app.users u on u.id = m.user_id
        where m.workspace_id = "app"."workspaces"."id" and m.role = 'owner' limit 1)`,
      members: sql<number>`(select count(*)::int from app.memberships m where m.workspace_id = "app"."workspaces"."id")`,
      accounts: sql<number>`(select count(*)::int from app.ad_accounts a join app.meta_connections c on c.id = a.connection_id
        where a.workspace_id = "app"."workspaces"."id" and c.status <> 'revoked')`,
    })
    .from(workspaces)
    .where(
      q.trim()
        ? sql`${workspaces.name} ilike ${term} or exists (select 1 from app.memberships m join app.users u on u.id = m.user_id
            where m.workspace_id = "app"."workspaces"."id" and u.email ilike ${term})`
        : undefined,
    )
    .orderBy(desc(workspaces.createdAt))
    .limit(Math.min(limit, 200));
}

/**
 * Chi tiết một workspace cho hỗ trợ khách: gói, thành viên, kết nối Meta (trạng thái, hạn token — KHÔNG bao giờ trả
 * token), tài khoản QC + đồng bộ / đối chiếu gần nhất, cờ, sự cố đang mở, yêu cầu xóa dữ liệu. Không trả số liệu
 * quảng cáo (chi tiêu, kết quả). Xuyên workspace có chủ đích: chỉ route staff gọi.
 */
export async function adminWorkspaceDetail(db: DbOrTx, workspaceId: string) {
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  if (!ws) throw notFound('Workspace');
  const ctx = { db, workspaceId };
  const [billing, members, connections, accounts, flags, incidents, deletions] = await Promise.all([
    billingStatus(ctx),
    db
      .select({ userId: users.id, email: users.email, fullName: users.fullName, role: memberships.role })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.workspaceId, workspaceId)),
    db
      .select({
        id: metaConnections.id,
        metaUserName: metaConnections.metaUserName,
        status: metaConnections.status,
        expiresAt: metaConnections.expiresAt,
        lastRefreshedAt: metaConnections.lastRefreshedAt,
        isDemo: metaConnections.isDemo,
        writeEnabled: metaConnections.writeEnabled,
        scopes: metaConnections.scopes,
        createdAt: metaConnections.createdAt,
      })
      .from(metaConnections)
      .where(eq(metaConnections.workspaceId, workspaceId))
      .orderBy(desc(metaConnections.createdAt)),
    db
      .select({
        id: adAccounts.id,
        metaAccountId: adAccounts.metaAccountId,
        name: adAccounts.name,
        timezone: adAccounts.timezone,
        currency: adAccounts.currency,
        clientName: clients.name,
        assignmentStatus: adAccounts.assignmentStatus,
        syncStatus: adAccounts.syncStatus,
        lastSyncedAt: adAccounts.lastSyncedAt,
        active30d: adAccounts.active30d,
        connectionId: adAccounts.connectionId,
        connectionStatus: metaConnections.status,
      })
      .from(adAccounts)
      .innerJoin(metaConnections, eq(metaConnections.id, adAccounts.connectionId))
      .leftJoin(clients, eq(clients.id, adAccounts.clientId))
      .where(eq(adAccounts.workspaceId, workspaceId))
      .orderBy(adAccounts.name),
    db
      .select({ key: featureFlags.flagKey, enabled: featureFlags.enabled, enabledAt: featureFlags.enabledAt })
      .from(featureFlags)
      .where(eq(featureFlags.workspaceId, workspaceId)),
    db
      .select({
        id: opsIncidents.id,
        kind: opsIncidents.kind,
        severity: opsIncidents.severity,
        title: opsIncidents.title,
        openedAt: opsIncidents.createdAt,
      })
      .from(opsIncidents)
      .where(and(eq(opsIncidents.workspaceId, workspaceId), inArray(opsIncidents.status, ['open', 'mitigated'])))
      .orderBy(desc(opsIncidents.createdAt)),
    db
      .select({
        id: deletionRequests.id,
        code: deletionRequests.code,
        status: deletionRequests.status,
        purgeAfter: deletionRequests.purgeAfter,
        completedAt: deletionRequests.completedAt,
      })
      .from(deletionRequests)
      .where(eq(deletionRequests.workspaceId, workspaceId))
      .orderBy(desc(deletionRequests.purgeAfter))
      .limit(10),
  ]);

  const ids = accounts.map((a) => a.id);
  const [runs, recon] = ids.length
    ? await Promise.all([
        db
          .select({
            id: syncRuns.id,
            adAccountId: syncRuns.adAccountId,
            kind: syncRuns.kind,
            status: syncRuns.status,
            dateFrom: syncRuns.dateFrom,
            dateTo: syncRuns.dateTo,
            error: syncRuns.error,
            startedAt: syncRuns.startedAt,
            finishedAt: syncRuns.finishedAt,
          })
          .from(syncRuns)
          .where(eq(syncRuns.workspaceId, workspaceId))
          .orderBy(desc(sql`coalesce(${syncRuns.startedAt}, now())`))
          .limit(20),
        db
          .select({
            adAccountId: reconciliationResults.adAccountId,
            lastCheckedAt: sql<Date | null>`max(${reconciliationResults.checkedAt})`,
            warnings: sql<number>`count(*) filter (where ${reconciliationResults.status} <> 'ok')::int`,
            days: sql<number>`count(*)::int`,
          })
          .from(reconciliationResults)
          .where(
            and(
              eq(reconciliationResults.workspaceId, workspaceId),
              sql`${reconciliationResults.date} >= current_date - 30`,
            ),
          )
          .groupBy(reconciliationResults.adAccountId),
      ])
    : [[], []];
  const reconBy = new Map(recon.map((r) => [r.adAccountId, r]));

  return {
    workspace: { id: ws.id, name: ws.name, createdAt: ws.createdAt },
    billing: {
      plan: billing.effectivePlan,
      subscribedPlan: billing.subscribedPlan,
      status: billing.status,
      provider: billing.provider,
      currentPeriodEnd: billing.currentPeriodEnd,
      activeAccounts: billing.activeAccounts,
      accountLimit: billing.plan.includedAccounts,
      overLimit: billing.overLimit,
      graceUntil: billing.graceUntil,
    },
    members,
    connections,
    accounts: accounts.map((a) => ({
      ...a,
      reconciliation30d: reconBy.get(a.id) ?? { lastCheckedAt: null, warnings: 0, days: 0 },
    })),
    syncRuns: runs,
    flags,
    incidents,
    deletions,
  };
}
