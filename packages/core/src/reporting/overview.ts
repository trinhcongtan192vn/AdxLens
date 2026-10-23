import { and, eq, inArray, sql } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import { listAdAccounts, listClientOverview } from '@adxlens/core/connections';
import { healthScores } from '@adxlens/core/insight';
import { accountReconciliation } from '@adxlens/core/reconciliation';
import { addDays, localDate, sumDecimal, systemClock, type ActorCtx, type Clock } from '@adxlens/core/shared';
import { accountKpis, type DateRange } from './metrics';

const { findings } = schema;

export type AccountOverview = {
  id: string;
  name: string;
  currency: string;
  timezone: string;
  clientId: string | null;
  confirmed: boolean;
  spend7: string;
  spendPrev7: string;
  spend30: string;
  health: number;
  highIssues: number;
  recon: { status: 'ok' | 'warning' | 'pending'; maxSpendDeltaPct: string | null };
};

export type ClientRowOverview = {
  id: string;
  name: string;
  accounts: AccountOverview[];
  /** Chi tiêu cộng theo tiền tệ (không quy đổi). */
  spend7: Record<string, string>;
  spendPrev7: Record<string, string>;
  spend30: Record<string, string>;
  /** Health thấp nhất trong các tài khoản (thận trọng); null nếu chưa có tài khoản. */
  health: number | null;
  highIssues: number;
};

/** Khoảng "N ngày qua tới hôm qua" theo múi giờ (ngày insight theo múi giờ tài khoản — quy tắc 4). */
function lastDays(n: number, tz: string, now: Date): DateRange {
  const to = addDays(localDate(now, tz), -1);
  return { from: addDays(to, -(n - 1)), to };
}

function sumByCurrency(accounts: AccountOverview[], key: 'spend7' | 'spendPrev7' | 'spend30') {
  const out: Record<string, string> = {};
  for (const c of new Set(accounts.map((a) => a.currency))) {
    out[c] = sumDecimal(accounts.filter((a) => a.currency === c).map((a) => a[key]));
  }
  return out;
}

/**
 * O01 / C01 (PRD P0-11): theo Client và tài khoản — health score, số vấn đề mức cao, chi tiêu 7/30 ngày
 * (so 7 ngày trước), đối chiếu. Không thống kê theo media buyer.
 */
export async function agencyOverview(
  ctx: ActorCtx,
  clock: Clock = systemClock,
): Promise<{ clients: ClientRowOverview[]; unassigned: AccountOverview[] }> {
  const now = clock.now();
  const [clients, accounts] = await Promise.all([listClientOverview(ctx), listAdAccounts(ctx)]);
  const live = accounts.filter((a) => a.connectionStatus !== 'revoked');
  const ids = live.map((a) => a.id);
  const byTz = new Map<string, string[]>();
  for (const a of live) byTz.set(a.timezone, [...(byTz.get(a.timezone) ?? []), a.id]);

  const k7 = new Map<string, string>();
  const kp7 = new Map<string, string>();
  const k30 = new Map<string, string>();
  for (const [tz, group] of byTz) {
    const r7 = lastDays(7, tz, now);
    const p7 = { from: addDays(r7.from, -7), to: addDays(r7.from, -1) };
    const [a, b, c] = await Promise.all([
      accountKpis(ctx, group, r7),
      accountKpis(ctx, group, p7),
      accountKpis(ctx, group, lastDays(30, tz, now)),
    ]);
    for (const id of group) {
      k7.set(id, a.get(id)?.spend ?? '0');
      kp7.set(id, b.get(id)?.spend ?? '0');
      k30.set(id, c.get(id)?.spend ?? '0');
    }
  }
  const [health, recon, high] = await Promise.all([
    healthScores(ctx, ids),
    accountReconciliation(ctx, ids, clock),
    ids.length
      ? ctx.db
          .select({ id: findings.adAccountId, n: sql<number>`count(*)::int` })
          .from(findings)
          .where(
            and(
              eq(findings.workspaceId, ctx.workspaceId),
              inArray(findings.adAccountId, ids),
              eq(findings.severity, 'high'),
              inArray(findings.status, ['new', 'seen']),
            ),
          )
          .groupBy(findings.adAccountId)
      : Promise.resolve([]),
  ]);
  const highBy = new Map(high.map((h) => [h.id, h.n]));
  const ov = new Map<string, AccountOverview>(
    live.map((a) => [
      a.id,
      {
        id: a.id,
        name: a.name,
        currency: a.currency,
        timezone: a.timezone,
        clientId: a.clientId,
        confirmed: a.assignmentStatus === 'confirmed',
        spend7: k7.get(a.id) ?? '0',
        spendPrev7: kp7.get(a.id) ?? '0',
        spend30: k30.get(a.id) ?? '0',
        health: health.get(a.id)?.score ?? 100,
        highIssues: highBy.get(a.id) ?? 0,
        recon: recon.get(a.id) ?? { status: 'pending', maxSpendDeltaPct: null },
      },
    ]),
  );

  const rows: ClientRowOverview[] = clients.map((c) => {
    const accs = c.accounts.map((a) => ov.get(a.id)).filter((a): a is AccountOverview => Boolean(a));
    return {
      id: c.id,
      name: c.name,
      accounts: accs,
      spend7: sumByCurrency(accs, 'spend7'),
      spendPrev7: sumByCurrency(accs, 'spendPrev7'),
      spend30: sumByCurrency(accs, 'spend30'),
      health: accs.length ? Math.min(...accs.map((a) => a.health)) : null,
      highIssues: accs.reduce((t, a) => t + a.highIssues, 0),
    };
  });
  const assigned = new Set(rows.flatMap((r) => r.accounts.map((a) => a.id)));
  return { clients: rows, unassigned: [...ov.values()].filter((a) => !assigned.has(a.id)) };
}
