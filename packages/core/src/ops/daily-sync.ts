import { and, eq, ne, sql } from 'drizzle-orm';
import type { Db } from '@adxlens/db';
import { schema } from '@adxlens/db';
import { DAILY_SYNC_HOUR } from '@adxlens/core/ingestion';
import { addDays, localDate } from '@adxlens/core/shared';

const { adAccounts, metaConnections } = schema;

/**
 * Truy vấn XUYÊN WORKSPACE có chủ đích (CLAUDE.md quy tắc 1): scheduler hệ thống tìm mọi tài khoản QC
 * đang ở giờ DAILY_SYNC_HOUR theo múi giờ của tài khoản để enqueue `sync:daily_account` cho từng
 * workspace. Chỉ trả định danh; mọi xử lý sau đó chạy trong ngữ cảnh đúng workspace.
 */
export async function dueDailySyncs(
  db: Db,
  now: Date,
): Promise<{ workspaceId: string; adAccountId: string; date: string }[]> {
  const rows = await db
    .select({ workspaceId: adAccounts.workspaceId, adAccountId: adAccounts.id, timezone: adAccounts.timezone })
    .from(adAccounts)
    .innerJoin(metaConnections, eq(metaConnections.id, adAccounts.connectionId))
    .where(
      and(
        eq(metaConnections.status, 'active'),
        ne(adAccounts.syncStatus, 'no_access'),
        sql`extract(hour from (${now.toISOString()}::timestamptz at time zone ${adAccounts.timezone})) = ${DAILY_SYNC_HOUR}`,
      ),
    );
  return rows.map((r) => ({
    workspaceId: r.workspaceId,
    adAccountId: r.adAccountId,
    date: addDays(localDate(now, r.timezone), -1),
  }));
}
