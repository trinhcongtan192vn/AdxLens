import { and, eq, isNotNull, ne } from 'drizzle-orm';
import type { Db } from '@adxlens/db';
import { schema } from '@adxlens/db';
import type { Enqueue } from '@adxlens/jobs';
import { notify } from '@adxlens/core/notification';
import { systemClock, type Clock } from '@adxlens/core/shared';

const { subscriptions } = schema;
const DAY = 86_400_000;

/**
 * Gia hạn PayOS (028), chạy trong `maintenance:daily_tick`. Truy vấn XUYÊN WORKSPACE có chủ đích: tìm mọi
 * subscription PayOS để nhắc gia hạn / chuyển trạng thái khi hết kỳ; mỗi thay đổi ghi theo đúng
 * `workspace_id`.
 * - Còn ≤ 7 ngày, rồi ≤ 1 ngày: nhắc owner (mỗi mốc một lần cho mỗi kỳ).
 * - Hết kỳ: đã hủy cuối kỳ → `canceled` (Free); chưa trả kỳ mới → `past_due` từ ngày hết kỳ (ân hạn 7 ngày).
 */
export async function runPayosRenewals(
  db: Db,
  deps: { enqueue?: Enqueue; clock?: Clock } = {},
): Promise<{ reminded: number; pastDue: number; canceled: number }> {
  const now = (deps.clock ?? systemClock).now();
  const rows = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.provider, 'payos'),
        ne(subscriptions.status, 'canceled'),
        isNotNull(subscriptions.currentPeriodEnd),
      ),
    );
  const out = { reminded: 0, pastDue: 0, canceled: 0 };
  for (const s of rows) {
    const ctx = { db, workspaceId: s.workspaceId };
    const end = s.currentPeriodEnd!;
    const where = eq(subscriptions.workspaceId, s.workspaceId);
    if (end <= now) {
      if (s.cancelAtPeriodEnd) {
        await db.update(subscriptions).set({ status: 'canceled' }).where(where);
        out.canceled++;
      } else if (s.status === 'active') {
        await db.update(subscriptions).set({ status: 'past_due', pastDueSince: end }).where(where);
        await notify(
          ctx,
          {
            kind: 'billing_failed',
            recipients: { roles: ['owner'] },
            link: '/settings/billing',
            dedupeKey: `payos_expired:${end.toISOString()}`,
          },
          { enqueue: deps.enqueue },
        );
        out.pastDue++;
      }
      continue;
    }
    if (s.cancelAtPeriodEnd || s.status !== 'active') continue;
    const daysLeft = Math.ceil((end.getTime() - now.getTime()) / DAY);
    const bucket = daysLeft <= 1 ? 1 : daysLeft <= 7 ? 7 : null;
    if (!bucket) continue;
    const r = await notify(
      ctx,
      {
        kind: 'billing_renewal',
        recipients: { roles: ['owner'] },
        params: { plan: s.planKey.charAt(0).toUpperCase() + s.planKey.slice(1), date: end.toISOString().slice(0, 10) },
        link: '/settings/billing',
        dedupeKey: `renewal:${end.toISOString()}:${bucket}`,
      },
      { enqueue: deps.enqueue },
    );
    if (r.created) out.reminded++;
  }
  return out;
}
