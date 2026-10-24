import 'server-only';
import { cookies } from 'next/headers';
import { listAdAccounts } from '@adxlens/core/connections';
import { PERIOD_COOKIE, periodRange, previousRange, toPeriod, type DateRange, type Period } from '@/lib/period';
import { W_PERIODS, W_SCOPE_COOKIE } from '@/lib/workspace-nav';
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
  /** Mọi tài khoản actor được xem (buyer chỉ Client được gán). */
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
 * Phạm vi của giao diện Workspace: cookie `w_scope` ("all" hoặc id tài khoản). Id lạ / không được xem → agency. Kỳ
 * dùng chung cookie với giao diện cổ điển nhưng chỉ nhận 7 / 14 / 30 ngày.
 */
export async function workspaceScope(pc: PageContext, now = new Date()): Promise<WScope> {
  const store = await cookies();
  const all = (await listAdAccounts(pc.ctx)).filter((a) => a.connectionStatus !== 'revoked');
  const accounts: WAccount[] = all.map((a) => ({
    id: a.id,
    metaAccountId: a.metaAccountId,
    name: a.name,
    currency: a.currency,
    timezone: a.timezone,
    clientId: a.clientId,
  }));
  const raw = store.get(W_SCOPE_COOKIE)?.value;
  const selected = accounts.find((a) => a.id === raw) ?? null;
  const count = new Map<string, number>();
  for (const a of accounts) count.set(a.currency, (count.get(a.currency) ?? 0) + 1);
  const main = [...count].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
  const inScope = selected ? [selected] : accounts.filter((a) => a.currency === main);
  const p = toPeriod(store.get(PERIOD_COOKIE)?.value);
  const period: Period = (W_PERIODS as readonly string[]).includes(p) ? p : 'last7';
  const timezone = inScope[0]?.timezone ?? 'Asia/Ho_Chi_Minh';
  const cur = periodRange(period, now, timezone);
  return {
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
