import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '@adxlens/db';
import { listAdAccounts } from '@adxlens/core/connections';
import { healthScores, topFindings } from '@adxlens/core/insight';
import {
  accountKpis,
  breakdownTable,
  entityMetricValues,
  entityNames,
  entityTable,
  explainCpaChange,
  METRIC_KEYS,
  metricValues,
  pctChange,
  scaleAnalysis,
  type MetricKey,
} from '@adxlens/core/reporting';
import { addDays, AppError, localDate, type ActorCtx } from '@adxlens/core/shared';
import type { AgentToolSpec } from './llm';

const { entities } = schema;

export const AGENT_PERIODS = ['yesterday', 'last7', 'last14', 'last30'] as const;
type Period = (typeof AGENT_PERIODS)[number];

export type ToolContext = {
  ctx: ActorCtx;
  /** Tài khoản người dùng đang chọn ở giao diện (ngữ cảnh mặc định). */
  defaultAccountId: string | null;
  now: Date;
};

export type ProposalOut = {
  actionType: 'pause_ad' | 'resume_ad' | 'pause_adset' | 'resume_adset' | 'set_adset_budget';
  adAccountId: string;
  targetMetaId: string;
  targetName: string | null;
  newDailyBudget?: string | null;
  reason?: string;
};

export type ToolResult = { data: unknown; proposal?: ProposalOut };

type Tool = {
  spec: AgentToolSpec;
  input: z.ZodTypeAny;
  /** Công cụ đề xuất ghi: chỉ có khi cờ `p2a_approve` bật. */
  write?: boolean;
  run: (t: ToolContext, input: never) => Promise<ToolResult>;
};

const period = z.enum(AGENT_PERIODS).default('last7');
const accountId = z.string().uuid().optional();

/** Bọc chuỗi do người dùng / Meta đặt (tên chiến dịch, tài khoản) — là dữ liệu, không phải lệnh (quy tắc 10). */
const data = (s: string | null | undefined) => (s == null ? null : `«${s.replace(/[«»]/g, '')}»`);

async function scope(t: ToolContext, id?: string) {
  const all = await listAdAccounts(t.ctx);
  const want = id ?? t.defaultAccountId;
  if (want) {
    const a = all.find((x) => x.id === want);
    if (!a) throw new AppError('NOT_FOUND', 'Không tìm thấy tài khoản QC');
    return { accounts: [a], currency: a.currency, timezone: a.timezone };
  }
  const count = new Map<string, number>();
  for (const a of all) count.set(a.currency, (count.get(a.currency) ?? 0) + 1);
  const main = [...count].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
  const accounts = all.filter((a) => a.currency === main);
  return { accounts, currency: main, timezone: accounts[0]?.timezone ?? 'Asia/Ho_Chi_Minh' };
}

function ranges(p: Period, tz: string, now: Date) {
  const y = addDays(localDate(now, tz), -1);
  const len = p === 'yesterday' ? 1 : p === 'last7' ? 7 : p === 'last14' ? 14 : 30;
  const cur = { from: addDays(y, -(len - 1)), to: y };
  return { cur, prev: { from: addDays(cur.from, -len), to: addDays(cur.from, -1) } };
}

const KPI_KEYS: MetricKey[] = [
  'spend',
  'results',
  'cpa',
  'ctr',
  'cpc',
  'cpm',
  'roas',
  'purchases',
  'cost_per_purchase',
  'leads',
  'cpl',
  'frequency',
];

export const TOOLS: Record<string, Tool> = {
  list_accounts: {
    spec: {
      name: 'list_accounts',
      description: 'Danh sách tài khoản quảng cáo người dùng được xem (id, tên, tiền tệ, múi giờ).',
      input_schema: { type: 'object', properties: {} },
    },
    input: z.object({}),
    run: async (t) => ({
      data: (await listAdAccounts(t.ctx)).map((a) => ({
        account_id: a.id,
        name: data(a.name),
        currency: a.currency,
        timezone: a.timezone,
        client: data(a.clientName),
      })),
    }),
  },

  account_kpis: {
    spec: {
      name: 'account_kpis',
      description:
        'Chỉ số tổng của một tài khoản (hoặc mọi tài khoản cùng tiền tệ chính khi không truyền account_id) cho kỳ đã chọn, kèm kỳ trước và % thay đổi đã tính sẵn.',
      input_schema: {
        type: 'object',
        properties: {
          account_id: { type: 'string', description: 'id tài khoản (uuid) từ list_accounts' },
          period: { type: 'string', enum: [...AGENT_PERIODS] },
        },
      },
    },
    input: z.object({ account_id: accountId, period }),
    run: async (t, i: { account_id?: string; period: Period }) => {
      const s = await scope(t, i.account_id);
      const { cur, prev } = ranges(i.period, s.timezone, t.now);
      const ids = s.accounts.map((a) => a.id);
      const [c, p] = await Promise.all([metricValues(t.ctx, ids, cur), metricValues(t.ctx, ids, prev)]);
      return {
        data: {
          currency: s.currency,
          accounts: s.accounts.length,
          period: cur,
          previous_period: prev,
          metrics: Object.fromEntries(
            KPI_KEYS.map((k) => [k, { current: c[k], previous: p[k], change_pct: pctChange(c[k], p[k]) }]),
          ),
        },
      };
    },
  },

  top_entities: {
    spec: {
      name: 'top_entities',
      description:
        'Xếp hạng chiến dịch / nhóm QC / quảng cáo theo một chỉ số trong kỳ (tốt nhất hoặc kém nhất), chỉ đối tượng có chi tiêu.',
      input_schema: {
        type: 'object',
        properties: {
          level: { type: 'string', enum: ['campaign', 'adset', 'ad'] },
          metric: { type: 'string', enum: [...METRIC_KEYS] },
          order: { type: 'string', enum: ['best', 'worst'] },
          period: { type: 'string', enum: [...AGENT_PERIODS] },
          account_id: { type: 'string' },
          limit: { type: 'integer', minimum: 1, maximum: 10 },
        },
        required: ['level', 'metric'],
      },
    },
    input: z.object({
      level: z.enum(['campaign', 'adset', 'ad']),
      metric: z.enum(METRIC_KEYS),
      order: z.enum(['best', 'worst']).default('best'),
      period,
      account_id: accountId,
      limit: z.number().int().min(1).max(10).default(5),
    }),
    run: async (
      t,
      i: {
        level: 'campaign' | 'adset' | 'ad';
        metric: MetricKey;
        order: 'best' | 'worst';
        period: Period;
        account_id?: string;
        limit: number;
      },
    ) => {
      const s = await scope(t, i.account_id);
      const { cur } = ranges(i.period, s.timezone, t.now);
      const ids = s.accounts.map((a) => a.id);
      const [values, names] = await Promise.all([
        entityMetricValues(t.ctx, ids, i.level, cur),
        entityNames(t.ctx, ids, i.level),
      ]);
      const lowerBetter = ['cpa', 'cpc', 'cpm', 'cost_per_purchase', 'cpl', 'cost_per_add_to_cart'].includes(i.metric);
      const rows = [...values]
        .filter(([, m]) => Number(m.spend ?? 0) > 0 && m[i.metric] != null)
        .sort(([, a], [, b]) => {
          const d = Number(a[i.metric]) - Number(b[i.metric]);
          const best = lowerBetter ? d : -d;
          return i.order === 'best' ? best : -best;
        })
        .slice(0, i.limit);
      const accOf = new Map<string, string>();
      if (rows.length) {
        const ents = await t.ctx.db
          .select({ metaId: entities.metaId, adAccountId: entities.adAccountId })
          .from(entities)
          .where(and(eq(entities.workspaceId, t.ctx.workspaceId), eq(entities.entityType, i.level)));
        for (const e of ents) accOf.set(e.metaId, e.adAccountId);
      }
      return {
        data: {
          currency: s.currency,
          period: cur,
          rows: rows.map(([metaId, m]) => ({
            meta_id: metaId,
            account_id: accOf.get(metaId) ?? null,
            name: data(names.get(metaId)),
            [i.metric]: m[i.metric],
            spend: m.spend,
            results: m.results,
          })),
        },
      };
    },
  },

  explain_cpa_change: {
    spec: {
      name: 'explain_cpa_change',
      description:
        'Phân rã thay đổi chi phí / kết quả (CPA) giữa kỳ này và kỳ trước của một tài khoản thành CPM, CTR, tỷ lệ chuyển đổi và các chiến dịch đóng góp nhiều nhất. null khi không đủ dữ liệu hoặc CPA gần như không đổi.',
      input_schema: {
        type: 'object',
        properties: { account_id: { type: 'string' }, period: { type: 'string', enum: [...AGENT_PERIODS] } },
      },
    },
    input: z.object({ account_id: accountId, period }),
    run: async (t, i: { account_id?: string; period: Period }) => {
      const s = await scope(t, i.account_id);
      const a = s.accounts[0];
      if (!a) return { data: null };
      const { cur, prev } = ranges(i.period, s.timezone, t.now);
      const [kc, kp, cc, cp] = await Promise.all([
        accountKpis(t.ctx, [a.id], cur),
        accountKpis(t.ctx, [a.id], prev),
        entityTable(t.ctx, [a.id], 'campaign', cur),
        entityTable(t.ctx, [a.id], 'campaign', prev),
      ]);
      const r = explainCpaChange(kc.get(a.id)!, kp.get(a.id)!, { current: cc, previous: cp });
      return {
        data: r && {
          account: data(a.name),
          currency: a.currency,
          cpa_current: r.current,
          cpa_previous: r.previous,
          change_pct: Math.round(r.changePct * 10) / 10,
          factors: r.factors.map((f) => ({
            factor: f.key,
            change_pct: Math.round(f.changePct * 10) / 10,
            share_of_change_pct: Math.round(f.sharePct * 10) / 10,
          })),
          drivers: r.drivers.map((d) => ({
            campaign: data(d.name),
            share_of_change_pct: Math.round(d.sharePct * 10) / 10,
            cpa: d.cpa,
            previous_cpa: d.previousCpa,
            spend: d.spend,
          })),
        },
      };
    },
  },

  open_findings: {
    spec: {
      name: 'open_findings',
      description:
        'Vấn đề đang mở do rule audit phát hiện (mức độ, nhóm, đối tượng, tác động ước tính), mức cao trước.',
      input_schema: {
        type: 'object',
        properties: { account_id: { type: 'string' }, limit: { type: 'integer', maximum: 10 } },
      },
    },
    input: z.object({ account_id: accountId, limit: z.number().int().min(1).max(10).default(6) }),
    run: async (t, i: { account_id?: string; limit: number }) => {
      const s = await scope(t, i.account_id);
      const rows = await topFindings(
        t.ctx,
        s.accounts.map((a) => a.id),
        i.limit,
      );
      const health = await healthScores(
        t.ctx,
        s.accounts.map((a) => a.id),
      );
      return {
        data: {
          health: [...health].map(([id, h]) => ({ account_id: id, score: h.score })),
          findings: rows.map((f) => ({
            rule: f.ruleId,
            group: f.ruleGroup,
            severity: f.severity,
            entity: data(f.entityName),
            impact_estimate: f.impactEstimate,
            account_id: f.adAccountId,
          })),
        },
      };
    },
  },

  breakdown: {
    spec: {
      name: 'breakdown',
      description: 'Chi tiêu, kết quả, CPA, CTR, tỷ trọng theo tuổi-giới tính, vị trí hiển thị hoặc khu vực.',
      input_schema: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['age_gender', 'placement', 'region'] },
          period: { type: 'string', enum: [...AGENT_PERIODS] },
          account_id: { type: 'string' },
        },
        required: ['kind'],
      },
    },
    input: z.object({ kind: z.enum(['age_gender', 'placement', 'region']), period, account_id: accountId }),
    run: async (t, i: { kind: 'age_gender' | 'placement' | 'region'; period: Period; account_id?: string }) => {
      const s = await scope(t, i.account_id);
      const { cur } = ranges(i.period, s.timezone, t.now);
      const rows = await breakdownTable(
        t.ctx,
        s.accounts.map((a) => a.id),
        cur,
        i.kind,
        10,
      );
      return {
        data: {
          currency: s.currency,
          rows: rows.map((r) => ({
            ...r,
            key: data(r.key),
            ctr_pct: r.ctr == null ? null : Math.round(r.ctr * 10000) / 100,
            ctr: undefined,
          })),
        },
      };
    },
  },

  ad_fatigue: {
    spec: {
      name: 'ad_fatigue',
      description:
        'Phân loại quảng cáo theo tần suất × CPC (mới và rẻ / đang cạn / đắt từ đầu / vẫn ổn) và các quảng cáo cần làm mới.',
      input_schema: {
        type: 'object',
        properties: { period: { type: 'string', enum: [...AGENT_PERIODS] }, account_id: { type: 'string' } },
      },
    },
    input: z.object({ period, account_id: accountId }),
    run: async (t, i: { period: Period; account_id?: string }) => {
      const s = await scope(t, i.account_id);
      const { cur, prev } = ranges(i.period, s.timezone, t.now);
      const r = await scaleAnalysis(
        t.ctx,
        s.accounts.map((a) => a.id),
        cur,
        prev,
      );
      const q = (k: string) => r.fatigue.points.filter((p) => p.quadrant === k);
      return {
        data: {
          median_frequency: Math.round(r.fatigue.freqMid * 100) / 100,
          median_cpc: Math.round(r.fatigue.cpcMid),
          counts: Object.fromEntries(
            ['fresh_cheap', 'burning_out', 'expensive_early', 'still_holding'].map((k) => [k, q(k).length]),
          ),
          burning_out: q('burning_out')
            .sort((a, b) => Number(b.spend) - Number(a.spend))
            .slice(0, 5)
            .map((p) => ({
              ad: data(p.name),
              meta_id: p.metaId,
              account_id: p.adAccountId,
              frequency: Math.round(p.frequency * 100) / 100,
              cpc: Math.round(p.cpc),
              spend: p.spend,
            })),
        },
      };
    },
  },

  propose_action: {
    write: true,
    spec: {
      name: 'propose_action',
      description:
        'ĐỀ XUẤT một thay đổi (tạm dừng / bật lại quảng cáo hoặc nhóm QC, đổi ngân sách ngày nhóm QC). KHÔNG thực hiện: người dùng sẽ xem trước, kiểm guardrails và tự duyệt. Chỉ dùng khi người dùng yêu cầu làm việc gì đó.',
      input_schema: {
        type: 'object',
        properties: {
          action_type: {
            type: 'string',
            enum: ['pause_ad', 'resume_ad', 'pause_adset', 'resume_adset', 'set_adset_budget'],
          },
          account_id: { type: 'string' },
          target_meta_id: { type: 'string' },
          new_daily_budget: {
            type: 'string',
            description: 'Chỉ với set_adset_budget, số thập phân theo tiền tệ tài khoản',
          },
          reason: { type: 'string' },
        },
        required: ['action_type', 'account_id', 'target_meta_id'],
      },
    },
    input: z.object({
      action_type: z.enum(['pause_ad', 'resume_ad', 'pause_adset', 'resume_adset', 'set_adset_budget']),
      account_id: z.string().uuid(),
      target_meta_id: z.string().regex(/^\d{1,30}$/),
      new_daily_budget: z
        .string()
        .regex(/^\d{1,14}(\.\d{1,2})?$/)
        .nullish(),
      reason: z.string().max(300).optional(),
    }),
    run: async (
      t,
      i: {
        action_type: ProposalOut['actionType'];
        account_id: string;
        target_meta_id: string;
        new_daily_budget?: string | null;
        reason?: string;
      },
    ) => {
      const s = await scope(t, i.account_id);
      const level = i.action_type.endsWith('_ad') ? 'ad' : 'adset';
      const [e] = await t.ctx.db
        .select({ name: entities.name })
        .from(entities)
        .where(
          and(
            eq(entities.workspaceId, t.ctx.workspaceId),
            eq(entities.adAccountId, s.accounts[0]!.id),
            eq(entities.entityType, level),
            eq(entities.metaId, i.target_meta_id),
          ),
        );
      if (!e) throw new AppError('NOT_FOUND', 'Không tìm thấy đối tượng');
      if (i.action_type === 'set_adset_budget' && !i.new_daily_budget)
        throw new AppError('VALIDATION_FAILED', 'Cần ngân sách mới');
      const proposal: ProposalOut = {
        actionType: i.action_type,
        adAccountId: i.account_id,
        targetMetaId: i.target_meta_id,
        targetName: e.name,
        newDailyBudget: i.new_daily_budget ?? null,
        reason: i.reason,
      };
      return { data: { proposed: true, note: 'Đã tạo thẻ đề xuất; người dùng sẽ xem trước và tự duyệt.' }, proposal };
    },
  },
};

/** Danh sách công cụ gửi LLM theo cờ (công cụ ghi chỉ khi `p2a_approve` bật — quy tắc 7). */
export function toolsFor(flags: { p2a_approve: boolean }): AgentToolSpec[] {
  return Object.values(TOOLS)
    .filter((t) => !t.write || flags.p2a_approve)
    .map((t) => t.spec);
}

export async function runTool(
  name: string,
  rawInput: unknown,
  t: ToolContext,
  flags: { p2a_approve: boolean },
): Promise<ToolResult> {
  const tool = TOOLS[name];
  if (!tool || (tool.write && !flags.p2a_approve)) throw new AppError('NOT_FOUND', `Không có công cụ ${name}`);
  const parsed = tool.input.safeParse(rawInput ?? {});
  if (!parsed.success) throw new AppError('VALIDATION_FAILED', 'Tham số công cụ không hợp lệ');
  return tool.run(t, parsed.data as never);
}
