import { eq } from 'drizzle-orm';
import type { Db } from '@adxlens/db';
import { schema } from '@adxlens/db';
import { newDeletionCode, revokeConnection, type DeletionDeps } from '@adxlens/core/connections';

const { metaConnections, deletionRequests } = schema;

/**
 * Data deletion / deauthorize callback của Meta (L3 5.5). Truy vấn XUYÊN WORKSPACE có chủ đích
 * (CLAUDE.md quy tắc 1): một người dùng Meta có thể đã kết nối ở nhiều workspace; mọi kết nối của
 * `metaUserId` bị thu hồi như ngắt kết nối, dùng chung một mã xác nhận trả cho Meta.
 */
export async function handleMetaDataDeletion(
  db: Db,
  metaUserId: string,
  deps: DeletionDeps,
): Promise<{ code: string; connections: number }> {
  const conns = await db
    .select({ id: metaConnections.id, workspaceId: metaConnections.workspaceId })
    .from(metaConnections)
    .where(eq(metaConnections.metaUserId, metaUserId));
  const code = newDeletionCode();
  for (const c of conns) {
    await revokeConnection(
      { db, workspaceId: c.workspaceId },
      c.id,
      { source: 'meta_callback', requestedBy: null, code },
      deps,
    );
  }
  return { code, connections: conns.length };
}

export type PublicDeletionStatus = 'pending' | 'in_progress' | 'done' | 'cancelled';

/**
 * Trang tra cứu công khai theo mã xác nhận (M05). Tra xuyên workspace theo mã ngẫu nhiên; chỉ trả trạng
 * thái và hạn, không lộ workspace hay tài khoản.
 */
export async function deletionStatusByCode(
  db: Db,
  code: string,
): Promise<{ status: PublicDeletionStatus; purgeAfter: Date } | null> {
  const c = code.trim().toUpperCase();
  if (!/^XD-[A-Z0-9]{8}$/.test(c)) return null;
  const rows = await db
    .select({ status: deletionRequests.status, purgeAfter: deletionRequests.purgeAfter })
    .from(deletionRequests)
    .where(eq(deletionRequests.code, c));
  if (!rows.length) return null;
  const purgeAfter = rows.reduce((m, r) => (r.purgeAfter > m ? r.purgeAfter : m), rows[0]!.purgeAfter);
  const st = rows.map((r) => r.status);
  const status: PublicDeletionStatus = st.every((s) => s === 'done')
    ? 'done'
    : st.every((s) => s === 'cancelled')
      ? 'cancelled'
      : st.some((s) => s === 'in_progress')
        ? 'in_progress'
        : st.every((s) => s === 'done' || s === 'cancelled')
          ? 'done'
          : 'pending';
  return { status, purgeAfter };
}
