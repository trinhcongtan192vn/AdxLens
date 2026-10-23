import { and, eq } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import { MetaApiError, type MetaReadApi } from '@adxlens/meta-client';
import { addDays, localDate, systemClock, type Clock, type WorkspaceCtx } from '@adxlens/core/shared';
import type { TokenKeys } from './crypto';
import { markConnectionExpired, withConnectionToken } from './service';

const { metaAvailableAccounts, adAccounts } = schema;

function sumSpend(rows: { spend: string }[]): string {
  // Tổng theo đơn vị nhỏ nhất (×10000) để không mất chính xác với numeric(18,4).
  const total = rows.reduce((t, r) => t + BigInt(Math.round(Number(r.spend) * 10_000)), 0n);
  const sign = total < 0n ? '-' : '';
  const abs = total < 0n ? -total : total;
  return `${sign}${abs / 10_000n}.${String(abs % 10_000n).padStart(4, '0')}`;
}

/**
 * Job `sync:refresh_accounts` (chỉ worker): làm mới danh sách tài khoản truy cập được và chi tiêu
 * 30 ngày (S04) bằng token đã giải mã. Token hết hạn/thu hồi → đánh dấu kết nối hết hạn (P0-21).
 */
export async function refreshAvailableAccounts(
  ctx: WorkspaceCtx,
  connectionId: string,
  deps: { meta: MetaReadApi; keys: TokenKeys; clock?: Clock },
): Promise<{ accounts: number; status: 'ok' | 'expired' }> {
  const clock = deps.clock ?? systemClock;
  try {
    return await withConnectionToken(ctx, connectionId, deps.keys, async (token) => {
      const accounts = await deps.meta.listAdAccounts(token);
      for (const a of accounts) {
        const today = localDate(clock.now(), a.timezone_name);
        const rows = await deps.meta.getInsights(token, a.id, {
          level: 'account',
          since: addDays(today, -30),
          until: addDays(today, -1),
        });
        const spend = sumSpend(rows);
        await ctx.db
          .insert(metaAvailableAccounts)
          .values({
            workspaceId: ctx.workspaceId,
            connectionId,
            metaAccountId: a.id,
            name: a.name || a.id,
            currency: a.currency,
            timezone: a.timezone_name,
            accountStatus: a.account_status ?? null,
            spend30d: spend,
            spendCheckedAt: clock.now(),
          })
          .onConflictDoUpdate({
            target: [metaAvailableAccounts.connectionId, metaAvailableAccounts.metaAccountId],
            set: { name: a.name || a.id, spend30d: spend, spendCheckedAt: clock.now(), seenAt: clock.now() },
          });
        // Tài khoản đã nhập: cập nhật "có chi tiêu 30 ngày" (dùng cho billing, S02).
        await ctx.db
          .update(adAccounts)
          .set({ active30d: Number(spend) > 0 })
          .where(and(eq(adAccounts.workspaceId, ctx.workspaceId), eq(adAccounts.metaAccountId, a.id)));
      }
      return { accounts: accounts.length, status: 'ok' as const };
    });
  } catch (e) {
    if (e instanceof MetaApiError && e.isTokenInvalid) {
      await markConnectionExpired(ctx, connectionId);
      return { accounts: 0, status: 'expired' };
    }
    throw e;
  }
}
