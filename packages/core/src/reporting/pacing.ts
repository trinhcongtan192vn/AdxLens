import { and, eq, sql } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import { listAdAccounts } from '@adxlens/core/connections';
import { notify } from '@adxlens/core/notification';
import type { Enqueue } from '@adxlens/jobs';
import {
  addDays,
  AppError,
  compareDecimal,
  divDecimal,
  fromScaled,
  localDate,
  mulRatio,
  systemClock,
  toScaled,
  type ActorCtx,
  type Clock,
} from '@adxlens/core/shared';
import { assertCan, getClient } from '@adxlens/core/tenancy';

const { clientBudgets } = schema;

/** Dự kiến lệch ngân sách quá mức này → "vượt" / "thiếu" (±10%). */
export const PACING_TOLERANCE = 0.1;
/** Chưa đủ số ngày này trong tháng thì chưa cảnh báo (đầu tháng dự báo dao động mạnh). */
export const PACING_ALERT_MIN_DAYS = 5;

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const AMOUNT = /^\d{1,14}(\.\d{1,2})?$/;

export type Pacing = {
  budgetId: string;
  month: string;
  amount: string;
  currency: string;
  /** Chi tiêu từ đầu tháng đến hết hôm qua (giờ tài khoản), chuỗi decimal. */
  spent: string;
  daysElapsed: number;
  daysInMonth: number;
  /** Dự kiến cả tháng theo tốc độ hiện tại (null khi chưa có ngày nào). */
  projected: string | null;
  /** (dự kiến / ngân sách − 1) × 100, chỉ để hiển thị. */
  projectedPct: number | null;
  /** Mỗi ngày còn lại cần chi để vừa đủ ngân sách (null khi hết tháng). */
  dailyNeeded: string | null;
  status: (typeof schema.PACING_STATUSES)[number];
};

const sub = (a: string, b: string) => fromScaled(toScaled(a) - toScaled(b));

function daysIn(month: string) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y!, m!, 0)).getUTCDate();
}

/** Ngân sách tháng của Client (Owner / Manager quản lý Client). Tiền tệ phải trùng tài khoản QC của Client. */
export async function setClientBudget(
  ctx: ActorCtx,
  input: { clientId: string; month: string; amount: string; currency: string },
) {
  assertCan(ctx.actor, 'clients.manage');
  await getClient(ctx, input.clientId);
  if (!MONTH.test(input.month)) throw new AppError('VALIDATION_FAILED', 'Tháng dạng YYYY-MM');
  if (!AMOUNT.test(input.amount) || toScaled(input.amount) <= 0n) {
    throw new AppError('VALIDATION_FAILED', 'Ngân sách phải là số dương');
  }
  const currencies = [...new Set((await listAdAccounts(ctx, { clientId: input.clientId })).map((a) => a.currency))];
  if (currencies.length && !currencies.includes(input.currency)) {
    throw new AppError('VALIDATION_FAILED', 'Tiền tệ khác tài khoản QC của Client', { currencies });
  }
  const values = { amount: input.amount, currency: input.currency, alertStatus: null };
  const [row] = await ctx.db
    .insert(clientBudgets)
    .values({
      workspaceId: ctx.workspaceId,
      clientId: input.clientId,
      month: input.month,
      createdBy: ctx.actor.userId,
      ...values,
    })
    .onConflictDoUpdate({ target: [clientBudgets.clientId, clientBudgets.month], set: values })
    .returning();
  return row!;
}

export async function deleteClientBudget(ctx: ActorCtx, input: { clientId: string; month: string }) {
  assertCan(ctx.actor, 'clients.manage');
  await getClient(ctx, input.clientId);
  await ctx.db
    .delete(clientBudgets)
    .where(
      and(
        eq(clientBudgets.workspaceId, ctx.workspaceId),
        eq(clientBudgets.clientId, input.clientId),
        eq(clientBudgets.month, input.month),
      ),
    );
}

/**
 * Tiến độ ngân sách tháng hiện tại của Client (theo múi giờ tài khoản đầu tiên): chi từ đầu tháng đến hôm qua, dự
 * kiến cả tháng theo tốc độ trung bình, trạng thái ±10%, mức chi mỗi ngày còn lại. Chỉ cộng tài khoản cùng tiền tệ
 * với ngân sách. Không có ngân sách → null.
 */
export async function clientPacing(
  ctx: ActorCtx,
  clientId: string,
  clock: Clock = systemClock,
): Promise<Pacing | null> {
  await getClient(ctx, clientId);
  const accounts = (await listAdAccounts(ctx, { clientId })).filter((a) => a.connectionStatus !== 'revoked');
  const tz = accounts[0]?.timezone ?? 'Asia/Ho_Chi_Minh';
  const today = localDate(clock.now(), tz);
  const month = today.slice(0, 7);
  const [b] = await ctx.db
    .select()
    .from(clientBudgets)
    .where(
      and(
        eq(clientBudgets.workspaceId, ctx.workspaceId),
        eq(clientBudgets.clientId, clientId),
        eq(clientBudgets.month, month),
      ),
    );
  if (!b) return null;
  const yesterday = addDays(today, -1);
  const daysElapsed = yesterday.startsWith(month) ? Number(yesterday.slice(8)) : 0;
  const daysInMonth = daysIn(month);
  const ids = accounts.filter((a) => a.currency === b.currency).map((a) => a.id);
  let spent = '0';
  if (ids.length && daysElapsed > 0) {
    const [r] = await ctx.db.execute<{ spend: string | null }>(sql`
      select coalesce(sum(spend), 0)::text as spend from analytics.insights_daily
      where workspace_id = ${ctx.workspaceId} and ad_account_id in ${ids}
        and date between ${`${month}-01`}::date and ${yesterday}::date`);
    spent = r?.spend ?? '0';
  }
  // Chia chính xác trên decimal (không qua tỷ lệ số thực): chi × số ngày trong tháng ÷ số ngày đã qua.
  const projected =
    daysElapsed > 0 ? divDecimal(fromScaled(toScaled(spent) * BigInt(daysInMonth)), String(daysElapsed)) : null;
  const upper = mulRatio(b.amount, 1 + PACING_TOLERANCE);
  const lower = mulRatio(b.amount, 1 - PACING_TOLERANCE);
  const status: Pacing['status'] =
    projected === null
      ? 'on_track'
      : compareDecimal(projected, upper) > 0
        ? 'over'
        : compareDecimal(projected, lower) < 0
          ? 'under'
          : 'on_track';
  const daysLeft = daysInMonth - daysElapsed;
  const remaining = sub(b.amount, spent);
  return {
    budgetId: b.id,
    month,
    amount: b.amount,
    currency: b.currency,
    spent,
    daysElapsed,
    daysInMonth,
    projected,
    projectedPct: projected === null ? null : Math.round((Number(projected) / Number(b.amount) - 1) * 1000) / 10,
    dailyNeeded: daysLeft > 0 && toScaled(remaining) > 0n ? divDecimal(remaining, String(daysLeft)) : null,
    status,
  };
}

/**
 * Cảnh báo ngân sách hằng ngày của một workspace (job `maintenance:daily_tick`): Client có ngân sách tháng này, đã
 * qua ≥ 5 ngày, dự kiến vượt / thiếu > 10% → thông báo Owner + người quản lý Client, một lần cho mỗi trạng thái
 * trong tháng (`alert_status`). Trở lại đúng tiến độ thì đặt lại để cảnh báo được lần sau.
 */
export async function runPacingAlerts(ctx: ActorCtx, deps: { enqueue?: Enqueue; clock?: Clock } = {}) {
  const clock = deps.clock ?? systemClock;
  const rows = await ctx.db
    .select({ clientId: clientBudgets.clientId })
    .from(clientBudgets)
    .where(eq(clientBudgets.workspaceId, ctx.workspaceId));
  const out = { checked: 0, alerted: 0 };
  for (const { clientId } of [...new Map(rows.map((r) => [r.clientId, r])).values()]) {
    const p = await clientPacing(ctx, clientId, clock);
    if (!p) continue;
    out.checked++;
    const [b] = await ctx.db.select().from(clientBudgets).where(eq(clientBudgets.id, p.budgetId));
    if (p.status === 'on_track') {
      if (b?.alertStatus)
        await ctx.db.update(clientBudgets).set({ alertStatus: null }).where(eq(clientBudgets.id, p.budgetId));
      continue;
    }
    if (p.daysElapsed < PACING_ALERT_MIN_DAYS || b?.alertStatus === p.status) continue;
    const client = await getClient(ctx, clientId);
    await notify(
      ctx,
      {
        kind: 'budget_pacing',
        recipients: { roles: ['owner', 'manager'], clientId },
        params: {
          client: client.name,
          status: p.status,
          pct: Math.abs(p.projectedPct ?? 0),
          month: `${p.month.slice(5)}/${p.month.slice(0, 4)}`,
        },
        link: `/clients/${clientId}`,
        dedupeKey: `budget_pacing:${p.budgetId}:${p.status}`,
      },
      { enqueue: deps.enqueue },
    );
    await ctx.db.update(clientBudgets).set({ alertStatus: p.status }).where(eq(clientBudgets.id, p.budgetId));
    out.alerted++;
  }
  return out;
}
