import { asc, eq, inArray } from 'drizzle-orm';
import type { DbOrTx } from '@adxlens/db';
import { schema } from '@adxlens/db';
import { systemClock, type Clock } from '@adxlens/core/shared';
import { deletionRequestsOverview, executionOverview } from './admin-oversight';
import { billingOverview } from './billing-admin';
import { getGlobalKillSwitch } from './kill-switch';
import { syncIssues } from './operations';
import { reconciliationBoard } from './reconciliation-board';

const { opsIncidents, flagProposals, workspaces } = schema;

export const INBOX_KEYS = [
  'incidents',
  'syncs',
  'reconciliation',
  'breakers',
  'billing',
  'deletions',
  'flagProposals',
] as const;
export type InboxKey = (typeof INBOX_KEYS)[number];

export type InboxItem = {
  count: number;
  /** Cần xử lý ngay (sự cố P1, breaker mở, xóa dữ liệu quá hạn, đồng bộ kẹt). */
  urgent: boolean;
  /** Mục cũ nhất đang chờ — để thấy việc tồn bao lâu. */
  oldestAt: Date | null;
  /** Tối đa 3 mục đầu để xem nhanh (tên, workspace). */
  top: { label: string; workspaceId: string | null; workspaceName: string | null }[];
};

export type AdminInbox = {
  items: Record<InboxKey, InboxItem>;
  killSwitch: { active: boolean; reason: string | null; changedAt: Date | null };
  /** Tổng số việc đang chờ (không tính kill switch). */
  total: number;
};

const TOP = 3;
const oldest = (dates: (Date | null | undefined)[]) =>
  dates.reduce<Date | null>((m, d) => (d && (!m || d < m) ? d : m), null);

/**
 * "Hôm nay" của admin (trang vào + số trên sidebar): việc đang chờ trên toàn hệ thống. Mỗi mục dùng CHÍNH hàm mà
 * trang tương ứng dùng (đồng bộ, đối chiếu, thực thi, thanh toán, xóa dữ liệu) để số trên sidebar khớp với trang.
 * XUYÊN WORKSPACE có chủ đích (CLAUDE.md quy tắc 1): chỉ trang staff gọi; chỉ trả tên và trạng thái vận hành,
 * không trả số liệu quảng cáo hay token.
 */
export async function adminInbox(db: DbOrTx, clock: Clock = systemClock): Promise<AdminInbox> {
  const [incidents, syncs, recon, exec, billing, deletions, proposals, killSwitch] = await Promise.all([
    db
      .select({
        title: opsIncidents.title,
        severity: opsIncidents.severity,
        createdAt: opsIncidents.createdAt,
        workspaceId: opsIncidents.workspaceId,
        workspaceName: workspaces.name,
      })
      .from(opsIncidents)
      .leftJoin(workspaces, eq(workspaces.id, opsIncidents.workspaceId))
      .where(inArray(opsIncidents.status, ['open', 'mitigated']))
      .orderBy(asc(opsIncidents.severity), asc(opsIncidents.createdAt))
      .limit(200),
    syncIssues(db, clock),
    reconciliationBoard(db, { onlyIssues: true }, clock),
    executionOverview(db, clock),
    billingOverview(db),
    deletionRequestsOverview(db, clock),
    db
      .select({
        flagKey: flagProposals.flagKey,
        createdAt: flagProposals.createdAt,
        workspaceId: flagProposals.workspaceId,
        workspaceName: workspaces.name,
      })
      .from(flagProposals)
      .innerJoin(workspaces, eq(workspaces.id, flagProposals.workspaceId))
      .where(eq(flagProposals.status, 'pending'))
      .orderBy(asc(flagProposals.createdAt))
      .limit(200),
    getGlobalKillSwitch(db),
  ]);

  const overdue = deletions.filter((d) => d.overdue);
  const stuckSyncs = syncs.filter((s) => s.status === 'running');
  const items: Record<InboxKey, InboxItem> = {
    incidents: {
      count: incidents.length,
      urgent: incidents.some((i) => i.severity === 'P1'),
      oldestAt: oldest(incidents.map((i) => i.createdAt)),
      top: incidents.slice(0, TOP).map((i) => ({
        label: `${i.severity} · ${i.title}`,
        workspaceId: i.workspaceId,
        workspaceName: i.workspaceName,
      })),
    },
    syncs: {
      count: syncs.length,
      urgent: stuckSyncs.length > 0,
      oldestAt: oldest(syncs.map((s) => s.finishedAt ?? s.startedAt)),
      top: syncs.slice(0, TOP).map((s) => ({
        label: s.accountName ?? s.metaAccountId,
        workspaceId: s.workspaceId,
        workspaceName: s.workspaceName,
      })),
    },
    reconciliation: {
      count: recon.length,
      urgent: false,
      oldestAt: oldest(recon.map((r) => r.lastCheckedAt)),
      top: recon.slice(0, TOP).map((r) => ({
        label: r.accountName,
        workspaceId: r.workspaceId,
        workspaceName: r.workspaceName,
      })),
    },
    breakers: {
      count: exec.breakers.length,
      urgent: exec.breakers.length > 0,
      oldestAt: oldest(exec.breakers.map((b) => b.openedAt)),
      top: exec.breakers.slice(0, TOP).map((b) => ({
        label: b.accountName,
        workspaceId: b.workspaceId,
        workspaceName: b.workspaceName,
      })),
    },
    billing: {
      count: billing.attention.length,
      urgent: false,
      oldestAt: oldest(billing.attention.map((b) => b.pastDueSince ?? b.overLimitSince)),
      top: billing.attention.slice(0, TOP).map((b) => ({
        label: b.planKey,
        workspaceId: b.workspaceId,
        workspaceName: b.workspaceName,
      })),
    },
    deletions: {
      count: overdue.length,
      urgent: overdue.length > 0,
      oldestAt: oldest(overdue.map((d) => d.purgeAfter)),
      top: overdue.slice(0, TOP).map((d) => ({
        label: d.code,
        workspaceId: d.workspaceId,
        workspaceName: d.workspaceName,
      })),
    },
    flagProposals: {
      count: proposals.length,
      urgent: false,
      oldestAt: oldest(proposals.map((p) => p.createdAt)),
      top: proposals.slice(0, TOP).map((p) => ({
        label: p.flagKey,
        workspaceId: p.workspaceId,
        workspaceName: p.workspaceName,
      })),
    },
  };
  return {
    items,
    killSwitch,
    total: INBOX_KEYS.reduce((t, k) => t + items[k].count, 0),
  };
}
