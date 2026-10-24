import { and, eq, gte, inArray, isNotNull } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import { listAdAccounts } from '@adxlens/core/connections';
import { addDays, localDate, systemClock, type ActorCtx, type Clock } from '@adxlens/core/shared';

const { actions } = schema;

export const AUTOMATION_KINDS = ['start', 'pause', 'increase_budget', 'decrease_budget', 'other'] as const;
export type AutomationKind = (typeof AUTOMATION_KINDS)[number];

/** Loại hành động như Madgicx Automation Overview (Start / Pause / Increase budget / Decrease budget). */
export function automationKind(a: {
  actionType: string;
  beforeState: Record<string, string | null>;
  afterExpected: Record<string, string | null>;
}): AutomationKind {
  if (a.actionType.startsWith('pause_')) return 'pause';
  if (a.actionType.startsWith('resume_')) return 'start';
  if (a.actionType === 'set_adset_budget') {
    const before = Number(a.beforeState.daily_budget ?? 0);
    const after = Number(a.afterExpected.daily_budget ?? 0);
    return after > before ? 'increase_budget' : after < before ? 'decrease_budget' : 'other';
  }
  return 'other';
}

export type AutomationOverview = {
  /** Hành động do rule tạo (tier `auto`) trong 7 ngày, theo loại. */
  counts: Record<AutomationKind, number>;
  /** Theo ngày (múi giờ tài khoản đầu tiên) × loại, 7 ngày tới hôm nay. */
  daily: { date: string; counts: Record<AutomationKind, number> }[];
  /** Theo rule: số hành động 48 giờ / 7 ngày, lần kích hoạt cuối. */
  perRule: Map<string, { last48h: number; last7d: number; lastAt: Date | null }>;
};

const zero = () => Object.fromEntries(AUTOMATION_KINDS.map((k) => [k, 0])) as Record<AutomationKind, number>;

/**
 * Tổng quan tự động hóa (cải tiến giao diện cổ điển theo Madgicx 3.2): chỉ ĐỌC bảng hành động (không ghi Meta, không
 * đụng Execution Gateway). Hành động bị hủy / thất bại vẫn đếm là "đã kích hoạt".
 */
export async function automationOverview(ctx: ActorCtx, clock: Clock = systemClock): Promise<AutomationOverview> {
  const accounts = await listAdAccounts(ctx);
  const ids = accounts.map((a) => a.id);
  const tz = accounts[0]?.timezone ?? 'Asia/Ho_Chi_Minh';
  const now = clock.now();
  const today = localDate(now, tz);
  const since = new Date(now.getTime() - 7 * 86_400_000);
  const rows = ids.length
    ? await ctx.db
        .select({
          ruleId: actions.ruleId,
          actionType: actions.actionType,
          beforeState: actions.beforeState,
          afterExpected: actions.afterExpected,
          createdAt: actions.createdAt,
        })
        .from(actions)
        .where(
          and(
            eq(actions.workspaceId, ctx.workspaceId),
            inArray(actions.adAccountId, ids),
            eq(actions.tier, 'auto'),
            isNotNull(actions.ruleId),
            gte(actions.createdAt, since),
          ),
        )
    : [];
  const counts = zero();
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const daily = days.map((date) => ({ date, counts: zero() }));
  const perRule = new Map<string, { last48h: number; last7d: number; lastAt: Date | null }>();
  for (const r of rows) {
    const k = automationKind(r);
    counts[k]++;
    const d = daily.find((x) => x.date === localDate(r.createdAt, tz));
    if (d) d.counts[k]++;
    const p = perRule.get(r.ruleId!) ?? { last48h: 0, last7d: 0, lastAt: null };
    p.last7d++;
    if (now.getTime() - r.createdAt.getTime() <= 48 * 3_600_000) p.last48h++;
    if (!p.lastAt || r.createdAt > p.lastAt) p.lastAt = r.createdAt;
    perRule.set(r.ruleId!, p);
  }
  return { counts, daily, perRule };
}
