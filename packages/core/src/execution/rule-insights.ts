import { sql } from 'drizzle-orm';
import { listAdAccounts } from '@adxlens/core/connections';
import {
  addDays,
  AppError,
  compareDecimal,
  divDecimal,
  localDate,
  mulRatio,
  sumDecimal,
  systemClock,
  type ActorCtx,
  type Clock,
} from '@adxlens/core/shared';
import { assertCan } from '@adxlens/core/tenancy';
import { BACKTEST_DAYS, backtestRule, RULE_TEMPLATES, type RuleInput } from './rules';

/**
 * "Nếu đã chạy rule này thì tiết kiệm được bao nhiêu trong 30 ngày" + ngưỡng gợi ý từ dữ liệu kèm lý do (Madgicx AI
 * Marketer, ý tưởng #1). Chỉ đọc snapshot, không gọi Meta; số do code tính (quy tắc 5).
 */

export type RuleSavings = {
  /** saved: chi tiêu tránh được (tạm dừng / giảm ngân sách); extra: chi thêm (tăng ngân sách); none: không có lần nào. */
  kind: 'saved' | 'extra' | 'none';
  amount: string;
  currency: string;
  entities: number;
  actions: number;
  days: number;
};

/**
 * Ước tính từ backtest: với mỗi đối tượng, lấy lần kích hoạt ĐẦU TIÊN; chi tiêu của nó từ ngày sau đó tới hết kỳ là
 * phần tránh được (tạm dừng) hoặc × |%| (đổi ngân sách). Giả định Meta không dồn ngân sách sang chỗ khác — giao diện ghi rõ.
 */
export async function estimateRuleSavings(
  ctx: ActorCtx,
  input: RuleInput,
  clock: Clock = systemClock,
): Promise<RuleSavings & { items: Awaited<ReturnType<typeof backtestRule>>['items'] }> {
  const bt = await backtestRule(ctx, input, clock);
  const account = (await listAdAccounts(ctx)).find((a) => a.id === input.adAccountId)!;
  const end = addDays(localDate(clock.now(), account.timezone), -1);
  const first = new Map<string, string>();
  for (const it of bt.items)
    if (!first.has(it.metaId) || it.date < first.get(it.metaId)!) first.set(it.metaId, it.date);
  const base = {
    currency: account.currency,
    entities: first.size,
    actions: bt.items.length,
    days: bt.days,
    items: bt.items,
  };
  if (!first.size) return { ...base, kind: 'none', amount: '0' };

  const key = sql.raw(input.level === 'ad' ? 'i.meta_id' : 'i.adset_id');
  const ids = [...first.keys()];
  const rows = await ctx.db.execute<{ k: string; date: string; spend: string }>(sql`
    select ${key} as k, i.date::text as date, sum(i.spend)::text as spend
    from analytics.insights_daily i
    where i.workspace_id = ${ctx.workspaceId} and i.ad_account_id = ${input.adAccountId} and i.entity_type = 'ad'
      and i.date between ${addDays(end, -(BACKTEST_DAYS - 1))} and ${end}
      and ${key} in (${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )})
    group by 1, 2`);
  const after = sumDecimal(rows.filter((r) => r.date > first.get(r.k)!).map((r) => r.spend));
  const action = input.action;
  if (action.type === 'set_adset_budget') {
    const pct = Number(action.changePct ?? '0');
    const amount = mulRatio(after, Math.abs(pct) / 100);
    return { ...base, kind: pct > 0 ? 'extra' : 'saved', amount };
  }
  return { ...base, kind: 'saved', amount: after };
}

export type SuggestedValue = {
  index: number;
  value: string;
  /** Lý do dạng khóa + tham số (giao diện dịch); số trong tham số do code tính. */
  reason: { key: 'cpa_x2' | 'frequency_x1_5'; params: Record<string, string> };
};

/**
 * Ngưỡng theo dữ liệu 30 ngày của tài khoản cho mẫu rule ("Vì sao giá trị này?"). Không đủ dữ liệu → không gợi ý
 * (giữ giá trị mặc định của mẫu).
 */
export async function suggestTemplateValues(
  ctx: ActorCtx,
  templateKey: string,
  adAccountId: string,
  clock: Clock = systemClock,
): Promise<{ condition: { metric: string; op: string; value: string }[]; suggested: SuggestedValue[] }> {
  assertCan(ctx.actor, 'automation.manage');
  const tpl = RULE_TEMPLATES.find((t) => t.key === templateKey);
  if (!tpl) throw new AppError('NOT_FOUND', 'Không tìm thấy mẫu');
  const account = (await listAdAccounts(ctx)).find((a) => a.id === adAccountId);
  if (!account) throw new AppError('NOT_FOUND', 'Không tìm thấy tài khoản');
  const end = addDays(localDate(clock.now(), account.timezone), -1);
  const from = addDays(end, -(BACKTEST_DAYS - 1));
  const [agg] = await ctx.db.execute<{
    spend: string | null;
    results: string | null;
    freq_w: string | null;
    imp: string | null;
  }>(sql`
    select sum(spend)::text as spend, sum(results)::text as results,
      sum(coalesce(frequency, 0) * impressions)::text as freq_w, sum(impressions)::text as imp
    from analytics.insights_daily
    where workspace_id = ${ctx.workspaceId} and ad_account_id = ${adAccountId} and entity_type = 'ad'
      and date between ${from} and ${end}`);
  const condition = tpl.condition.map((c) => ({ ...c }));
  const suggested: SuggestedValue[] = [];
  const cpa =
    agg?.spend && agg.results && compareDecimal(agg.results, '0') > 0 ? divDecimal(agg.spend, agg.results, 0) : null;
  const freq = agg?.freq_w && agg.imp && compareDecimal(agg.imp, '0') > 0 ? divDecimal(agg.freq_w, agg.imp, 2) : null;

  condition.forEach((c, index) => {
    // "Chi ≥ 2 × CPA 30 ngày mà 0 kết quả": đủ tiền để kỳ vọng ít nhất 1–2 kết quả.
    if (c.metric === 'spend' && cpa && compareDecimal(cpa, '0') > 0) {
      const value = mulRatio(cpa, 2).split('.')[0]!;
      c.value = value;
      suggested.push({ index, value, reason: { key: 'cpa_x2', params: { cpa, currency: account.currency } } });
    }
    // Tần suất "mệt": 1,5 × tần suất trung bình 30 ngày, tối thiểu 2.
    if (c.metric === 'frequency' && freq) {
      const raw = mulRatio(freq, 1.5);
      const value = compareDecimal(raw, '2') < 0 ? '2' : Number(raw).toFixed(1);
      c.value = value;
      suggested.push({
        index,
        value,
        reason: { key: 'frequency_x1_5', params: { frequency: Number(freq).toFixed(2) } },
      });
    }
  });
  return { condition, suggested };
}

/** Mẫu rule ứng với nguồn gợi ý (Việc tuần này → "Tạo automation từ gợi ý này"). */
export function templateForSource(sourceKey: string): string | null {
  return RULE_TEMPLATES.find((t) => t.sourceKey === sourceKey)?.key ?? null;
}
