import 'server-only';
import { cookies } from 'next/headers';
import { listAdAccounts } from '@adxlens/core/connections';
import { PERIOD_COOKIE, periodRange, previousRange, toPeriod, type DateRange, type Period } from '@/lib/period';
import { pickScope } from '@/lib/scope';
import { W_CLIENT_COOKIE, W_PERIODS, W_SCOPE_COOKIE } from '@/lib/workspace-nav';
import type { PageContext } from './page-context';

export type WAccount = {
  id: string;
  metaAccountId: string;
  name: string;
  currency: string;
  timezone: string;
  clientId: string | null;
};

export type WScope = {
  /** Client đang xem (chọn ở đầu sidebar); null = mọi Client. */
  clientId: string | null;
  /** Tài khoản actor được xem trong Client đang xem (buyer chỉ Client được gán). */
  accounts: WAccount[];
  /** Tài khoản đang chọn; null = phạm vi agency (mọi tài khoản cùng tiền tệ chính). */
  selected: WAccount | null;
  /** Tài khoản tính số: một tài khoản, hoặc các tài khoản cùng tiền tệ chính (không cộng khác tiền tệ). */
  ids: string[];
  currency: string | null;
  timezone: string;
  /** Có tài khoản khác tiền tệ bị loại khỏi phạm vi agency. */
  excludedOtherCurrency: number;
  period: Period;
  cur: DateRange;
  prev: DateRange;
};

/**
 * Phạm vi của giao diện Workspace: cookie `w_client` (Client chọn ở sidebar) rồi `w_scope` ("all" hoặc id tài khoản
 * trong Client đó). Id lạ / không được xem → bỏ qua. Kỳ dùng chung cookie với giao diện cổ điển, chỉ nhận 7 / 14 / 30.
 */
export async function workspaceScope(pc: PageContext, now = new Date()): Promise<WScope> {
  const store = await cookies();
  const all = (await listAdAccounts(pc.ctx)).filter((a) => a.connectionStatus !== 'revoked');
  const visible: WAccount[] = all.map((a) => ({
    id: a.id,
    metaAccountId: a.metaAccountId,
    name: a.name,
    currency: a.currency,
    timezone: a.timezone,
    clientId: a.clientId,
  }));
  const { clientId, accounts, selected, inScope, main } = pickScope(
    visible,
    store.get(W_CLIENT_COOKIE)?.value,
    store.get(W_SCOPE_COOKIE)?.value,
  );
  const p = toPeriod(store.get(PERIOD_COOKIE)?.value);
  const period: Period = (W_PERIODS as readonly string[]).includes(p) ? p : 'last7';
  const timezone = inScope[0]?.timezone ?? 'Asia/Ho_Chi_Minh';
  const cur = periodRange(period, now, timezone);
  return {
    clientId,
    accounts,
    selected,
    ids: inScope.map((a) => a.id),
    currency: selected?.currency ?? main,
    timezone,
    excludedOtherCurrency: selected ? 0 : accounts.length - inScope.length,
    period,
    cur,
    prev: previousRange(cur),
  };
}
