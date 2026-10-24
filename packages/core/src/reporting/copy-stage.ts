import { sql } from 'drizzle-orm';
import { listAdAccounts } from '@adxlens/core/connections';
import type { ActorCtx } from '@adxlens/core/shared';
import { computeMetrics, METRIC_SUMS, sumRaw, type MetricRaw, type MetricValues } from './metric-catalog';
import type { DateRange } from './metrics';

/**
 * Phân tích theo giai đoạn phễu, trang đích và chữ quảng cáo (Madgicx 360° Audit: Meta Dashboard, Top landing pages,
 * Ad Copy Insights). Mọi số do code tính từ insight + thuộc tính đã đồng bộ (giai đoạn của nhóm QC, chữ / URL của
 * creative). Chữ quảng cáo là dữ liệu từ Meta — chỉ hiển thị, không bao giờ làm lệnh.
 */

async function visible(ctx: ActorCtx, ids: string[]) {
  const allowed = new Set((await listAdAccounts(ctx)).map((a) => a.id));
  return ids.filter((id) => allowed.has(id));
}

export const STAGE_KEYS = ['prospecting', 're_engagement', 'retargeting', 'retention', 'unknown'] as const;
export type StageKey = (typeof STAGE_KEYS)[number];

export type StageRow = {
  stage: StageKey;
  metrics: MetricValues;
  prev: MetricValues;
  spendShare: number;
  adsets: number;
};

/** Chi tiêu / kết quả / ROAS theo giai đoạn phễu của nhóm QC (Madgicx "Strategy Status Overview"). */
export async function stageAnalysis(
  ctx: ActorCtx,
  adAccountIds: string[],
  cur: DateRange,
  prev: DateRange,
): Promise<StageRow[]> {
  const ids = await visible(ctx, adAccountIds);
  if (!ids.length) return [];
  const q = (r: DateRange) =>
    ctx.db.execute<MetricRaw & { stage: string | null; adsets: string }>(sql`
      select coalesce(e.attrs->>'funnel_stage', 'unknown') as stage, count(distinct i.adset_id)::text as adsets, ${METRIC_SUMS}
      from analytics.insights_daily i
      left join analytics.entities e
        on e.workspace_id = i.workspace_id and e.ad_account_id = i.ad_account_id and e.entity_type = 'adset'
        and e.meta_id = i.adset_id
      where i.workspace_id = ${ctx.workspaceId} and i.ad_account_id in ${ids}
        and i.date between ${r.from} and ${r.to}
      group by 1`);
  const [c, p] = await Promise.all([q(cur), q(prev)]);
  const total = c.reduce((t, r) => t + Number(r.spend ?? 0), 0);
  const prevBy = new Map(p.map((r) => [r.stage, computeMetrics(r)]));
  return STAGE_KEYS.map((stage) => {
    const r = c.find((x) => x.stage === stage);
    const m = computeMetrics(r);
    return {
      stage,
      metrics: m,
      prev: prevBy.get(stage) ?? computeMetrics(undefined),
      spendShare: total > 0 ? Math.round((Number(m.spend) / total) * 1000) / 10 : 0,
      adsets: Number(r?.adsets ?? 0),
    };
  }).filter((r) => Number(r.metrics.spend) > 0);
}

type AdCopyRow = MetricRaw & {
  meta_id: string;
  body: string | null;
  title: string | null;
  link: string | null;
  cta: string | null;
  ad_name: string | null;
};

async function adCopyRows(ctx: ActorCtx, ids: string[], range: DateRange): Promise<AdCopyRow[]> {
  return ctx.db.execute<AdCopyRow>(sql`
    select i.meta_id, a.name as ad_name, cr.attrs->>'body' as body, cr.attrs->>'title' as title,
      cr.attrs->>'link' as link, cr.attrs->>'cta' as cta, ${METRIC_SUMS}
    from analytics.insights_daily i
    join analytics.entities a
      on a.workspace_id = i.workspace_id and a.ad_account_id = i.ad_account_id and a.entity_type = 'ad' and a.meta_id = i.meta_id
    left join analytics.entities cr
      on cr.workspace_id = a.workspace_id and cr.ad_account_id = a.ad_account_id and cr.entity_type = 'creative'
      and cr.meta_id = a.attrs->>'creative_id'
    where i.workspace_id = ${ctx.workspaceId} and i.ad_account_id in ${ids} and i.date between ${range.from} and ${range.to}
    group by i.meta_id, a.name, cr.attrs`);
}

/** URL đích → khóa trang (host + đường dẫn, bỏ query / UTM, bỏ "/" cuối). Không phải URL hợp lệ → null. */
export function landingKey(link: string | null | undefined): string | null {
  if (!link) return null;
  try {
    const u = new URL(link);
    if (!/^https?:$/.test(u.protocol)) return null;
    const path = u.pathname.replace(/\/+$/, '') || '/';
    return `${u.host.replace(/^www\./, '')}${path === '/' ? '' : path}`;
  } catch {
    return null;
  }
}

export type LandingRow = { page: string; ads: number; metrics: MetricValues; cvr: number | null };

/** Phễu theo trang đích (Madgicx "Top landing pages"): chi tiêu, click, kết quả, tỷ lệ click → kết quả. */
export async function landingPages(ctx: ActorCtx, adAccountIds: string[], range: DateRange): Promise<LandingRow[]> {
  const ids = await visible(ctx, adAccountIds);
  if (!ids.length) return [];
  const rows = await adCopyRows(ctx, ids, range);
  const groups = new Map<string, AdCopyRow[]>();
  for (const r of rows) {
    const k = landingKey(r.link);
    if (!k) continue;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return [...groups]
    .map(([page, list]) => {
      const m = computeMetrics(sumRaw(list));
      const clicks = Number(m.link_clicks);
      const conv = Number(m.purchases) || Number(m.leads) || Number(m.results);
      return { page, ads: list.length, metrics: m, cvr: clicks > 0 ? Math.round((conv / clicks) * 10000) / 100 : null };
    })
    .sort((a, b) => Number(b.metrics.spend) - Number(a.metrics.spend));
}

const EMOJI = /\p{Extended_Pictographic}/gu;
export const COPY_LENGTHS = ['short', 'medium', 'long'] as const;
export type CopyLength = (typeof COPY_LENGTHS)[number];

/** Độ dài chữ quảng cáo (ký tự): ngắn ≤ 80, vừa ≤ 200, dài > 200. */
export function copyLength(body: string): CopyLength {
  const n = [...body.trim()].length;
  return n <= 80 ? 'short' : n <= 200 ? 'medium' : 'long';
}

export type CopyGroup = {
  key: string;
  ads: number;
  spendShare: number;
  roas: string | null;
  ctr: string | null;
  cpa: string | null;
};

export type AdCopyInsights = {
  /** Theo độ dài / có emoji / có link trong chữ. */
  byLength: CopyGroup[];
  byEmoji: CopyGroup[];
  byLink: CopyGroup[];
  topEmojis: { emoji: string; ads: number }[];
  /** Ma trận 4 góc cho từng đoạn chữ (gộp các quảng cáo cùng chữ), ngưỡng = trung vị chi tiêu × giá trị. */
  copies: {
    body: string;
    ads: number;
    spend: string;
    value: number;
    quadrant: 'getting_started' | 'overspend' | 'scalable' | 'core';
    roas: string | null;
    ctr: string | null;
  }[];
  valueBasis: 'revenue' | 'results';
};

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return 0;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Ad Copy Insights (Madgicx): chữ quảng cáo xếp theo độ dài, emoji, link + ma trận 4 góc. */
export async function adCopyInsights(ctx: ActorCtx, adAccountIds: string[], range: DateRange): Promise<AdCopyInsights> {
  const ids = await visible(ctx, adAccountIds);
  const empty: AdCopyInsights = {
    byLength: [],
    byEmoji: [],
    byLink: [],
    topEmojis: [],
    copies: [],
    valueBasis: 'results',
  };
  if (!ids.length) return empty;
  const rows = (await adCopyRows(ctx, ids, range)).filter((r) => r.body && Number(r.spend ?? 0) > 0);
  if (!rows.length) return empty;
  const total = rows.reduce((t, r) => t + Number(r.spend), 0);
  const group = (key: string, list: AdCopyRow[]): CopyGroup => {
    const m = computeMetrics(sumRaw(list));
    return {
      key,
      ads: list.length,
      spendShare: total > 0 ? Math.round((Number(m.spend) / total) * 1000) / 10 : 0,
      roas: m.roas,
      ctr: m.ctr,
      cpa: m.cpa,
    };
  };
  const by = (f: (r: AdCopyRow) => string, keys: readonly string[]) =>
    keys
      .map((k) => [k, rows.filter((r) => f(r) === k)] as const)
      .filter(([, l]) => l.length)
      .map(([k, l]) => group(k, l));
  const hasEmoji = (r: AdCopyRow) => ((r.body ?? '').match(EMOJI) ? 'with' : 'without');
  const hasLink = (r: AdCopyRow) => (/https?:\/\/|www\.|\.(vn|com)\b/i.test(r.body ?? '') ? 'with' : 'without');
  const emojiCount = new Map<string, number>();
  for (const r of rows)
    for (const e of new Set((r.body ?? '').match(EMOJI) ?? [])) emojiCount.set(e, (emojiCount.get(e) ?? 0) + 1);
  const byBody = new Map<string, AdCopyRow[]>();
  for (const r of rows) byBody.set(r.body!.trim(), [...(byBody.get(r.body!.trim()) ?? []), r]);
  const hasRevenue = rows.some((r) => Number(r.conversion_value ?? 0) > 0);
  const copies = [...byBody].map(([body, list]) => {
    const raw = sumRaw(list);
    const m = computeMetrics(raw);
    return {
      body,
      ads: list.length,
      spend: m.spend ?? '0',
      value: hasRevenue ? Number(raw.conversion_value) : Number(m.results),
      m,
    };
  });
  const sMid = median(copies.map((c) => Number(c.spend)));
  const vMid = median(copies.map((c) => c.value));
  return {
    byLength: by((r) => copyLength(r.body!), COPY_LENGTHS),
    byEmoji: by(hasEmoji, ['with', 'without']),
    byLink: by(hasLink, ['with', 'without']),
    topEmojis: [...emojiCount]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([emoji, ads]) => ({ emoji, ads })),
    copies: copies
      .map((c) => {
        const hs = Number(c.spend) > sMid;
        const hv = c.value > vMid;
        return {
          body: c.body,
          ads: c.ads,
          spend: c.spend,
          value: c.value,
          quadrant: (hs
            ? hv
              ? 'core'
              : 'overspend'
            : hv
              ? 'scalable'
              : 'getting_started') as AdCopyInsights['copies'][number]['quadrant'],
          roas: c.m.roas,
          ctr: c.m.ctr,
        };
      })
      .sort((a, b) => Number(b.spend) - Number(a.spend)),
    valueBasis: hasRevenue ? 'revenue' : 'results',
  };
}
