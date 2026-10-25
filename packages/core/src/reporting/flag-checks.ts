import { and, eq, gte, inArray, ne, sql } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import { registerFlagCheck } from '@adxlens/core/flags';
import { openP1Count } from '@adxlens/core/ops';
import { addDays, localDate, systemClock, type Clock } from '@adxlens/core/shared';

const { adAccounts, metaConnections, reconciliationResults } = schema;

/**
 * Checklist kỹ thuật tự động của cờ `p0_reports` (L3 18.3): mọi ad account đã xác nhận gán; đối chiếu 7 ngày
 * gần nhất không lệch; không có sự cố P1 đang mở. Gọi một lần khi khởi động (idempotent).
 */
export function registerReportingFlagChecks(clock: Clock = systemClock): void {
  registerFlagCheck('p0_reports', {
    id: 'accounts_confirmed',
    label: 'Mọi tài khoản QC đã xác nhận gán Client',
    run: async (db, workspaceId) => {
      const [r] = await db
        .select({
          total: sql<number>`count(*)::int`,
          unconfirmed: sql<number>`(count(*) filter (where ${adAccounts.assignmentStatus} <> 'confirmed'))::int`,
        })
        .from(adAccounts)
        .innerJoin(metaConnections, eq(metaConnections.id, adAccounts.connectionId))
        .where(and(eq(adAccounts.workspaceId, workspaceId), ne(metaConnections.status, 'revoked')));
      if (!r?.total) return { passed: false, detail: 'Chưa có tài khoản QC' };
      return r.unconfirmed ? { passed: false, detail: `${r.unconfirmed} tài khoản chưa xác nhận` } : { passed: true };
    },
  });
  registerFlagCheck('p0_reports', {
    id: 'reconciliation_ok_7d',
    label: 'Đối chiếu 7 ngày gần nhất khớp (lệch ≤ 1%)',
    run: async (db, workspaceId) => {
      const accounts = await db
        .select({ id: adAccounts.id })
        .from(adAccounts)
        .where(eq(adAccounts.workspaceId, workspaceId));
      if (!accounts.length) return { passed: false, detail: 'Chưa có tài khoản QC' };
      const from = addDays(localDate(clock.now(), 'Asia/Ho_Chi_Minh'), -8);
      const [r] = await db
        .select({
          days: sql<number>`count(*)::int`,
          warnings: sql<number>`(count(*) filter (where ${reconciliationResults.status} = 'warning'))::int`,
        })
        .from(reconciliationResults)
        .where(
          and(
            eq(reconciliationResults.workspaceId, workspaceId),
            inArray(
              reconciliationResults.adAccountId,
              accounts.map((a) => a.id),
            ),
            gte(reconciliationResults.date, from),
          ),
        );
      if (!r?.days) return { passed: false, detail: 'Chưa có kết quả đối chiếu' };
      return r.warnings ? { passed: false, detail: `${r.warnings} ngày lệch > 1%` } : { passed: true };
    },
  });
  registerFlagCheck('p0_reports', {
    id: 'no_open_p1',
    label: 'Không có sự cố P1 đang mở',
    run: async (db, workspaceId) => {
      const n = await openP1Count(db, workspaceId);
      return n ? { passed: false, detail: `${n} sự cố P1 đang mở` } : { passed: true };
    },
  });
}
