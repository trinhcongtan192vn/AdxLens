import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '@adxlens/db';
import type { Enqueue } from '@adxlens/jobs';
import { CREATIVE_CTAS } from '@adxlens/meta-client/write';
import { listAdAccounts } from '@adxlens/core/connections';
import { isEnabled } from '@adxlens/core/flags';
import { AppError, notFound, systemClock, type ActorCtx, type Clock, type WorkspaceCtx } from '@adxlens/core/shared';
import { canApproveActions, resolveActor } from '@adxlens/core/tenancy';
import { checkLaunch, executeAction, insertPlannedLaunch, type ExecuteDeps, type LaunchInput } from './gateway';

const { actionPlans, actions } = schema;

/** ADR-0031: tối đa bước mỗi kế hoạch; kế hoạch chưa duyệt hết hạn sau 24 giờ. */
export const PLAN_MAX_STEPS = 6;
export const PLAN_TTL_MS = 24 * 3_600_000;

/** Id Meta (số ở Meta thật; dữ liệu mẫu có dạng `page1`) — gateway kiểm tồn tại trong workspace. */
const metaId = z.string().regex(/^[\w-]{1,64}$/);
const stepKey = z.string().regex(/^[a-z][a-z0-9_]{0,19}$/);
const ref = z.object({ ref: stepKey });
const name = z.string().trim().min(1).max(200);

export const planStepSchema = z.discriminatedUnion('kind', [
  z.object({
    key: stepKey,
    kind: z.literal('create_creative'),
    draftId: z.string().uuid(),
    pageId: metaId,
    link: z.string().url().max(1000),
    message: z.string().trim().min(1).max(2000),
    headline: z.string().trim().min(1).max(255),
    cta: z.enum(CREATIVE_CTAS),
    name,
  }),
  z.object({
    key: stepKey,
    kind: z.literal('create_adset'),
    templateAdsetId: metaId,
    name,
    /** Đơn vị nhỏ nhất (như ngân sách Meta); null khi chiến dịch dùng ngân sách chiến dịch. */
    dailyBudget: z
      .string()
      .regex(/^\d{1,14}(\.\d{1,2})?$/)
      .nullable(),
    countries: z
      .array(z.string().regex(/^[A-Z]{2}$/))
      .min(1)
      .max(25),
    ageMin: z.number().int().min(13).max(65),
    ageMax: z.number().int().min(13).max(65),
    audienceIds: z.array(metaId).max(20).default([]),
  }),
  z.object({
    key: stepKey,
    kind: z.literal('create_ad'),
    adset: z.union([metaId, ref]),
    creative: z.union([metaId, ref]),
    name,
  }),
]);
export type PlanStep = z.infer<typeof planStepSchema>;
export type PlanStepResult = {
  key: string;
  status: 'pending' | 'success' | 'failed' | 'skipped';
  actionId?: string;
  createdId?: string;
  code?: string;
};
export type ActionPlan = typeof actionPlans.$inferSelect;

const isRef = (v: unknown): v is { ref: string } => typeof v === 'object' && v !== null && 'ref' in v;

/** Tham chiếu chỉ tới bước đứng trước, đúng loại (ADR-0031 mục 1). */
export function parsePlanSteps(raw: unknown): PlanStep[] {
  const r = z.array(planStepSchema).min(1).max(PLAN_MAX_STEPS).safeParse(raw);
  if (!r.success) {
    // Chỉ đường dẫn trường lỗi (vd. `1.dailyBudget`) — agent sửa lại được, không lặp lại giá trị.
    throw new AppError('VALIDATION_FAILED', 'Kế hoạch không hợp lệ', {
      fields: r.error.issues.map((i) => i.path.join('.')).slice(0, 10),
    });
  }
  const seen = new Map<string, PlanStep['kind']>();
  for (const s of r.data) {
    if (seen.has(s.key)) throw new AppError('VALIDATION_FAILED', `Khóa bước trùng: ${s.key}`);
    if (s.kind === 'create_adset' && s.ageMin > s.ageMax) throw new AppError('VALIDATION_FAILED', 'Tuổi không hợp lệ');
    if (s.kind === 'create_ad') {
      for (const [field, kind] of [
        ['adset', 'create_adset'],
        ['creative', 'create_creative'],
      ] as const) {
        const v = s[field];
        if (isRef(v) && seen.get(v.ref) !== kind) {
          throw new AppError('VALIDATION_FAILED', `Bước ${s.key}: ${field} phải tham chiếu bước ${kind} đứng trước`);
        }
      }
    }
    seen.set(s.key, s.kind);
  }
  return r.data;
}

async function assertFlag(ctx: WorkspaceCtx) {
  if (!(await isEnabled(ctx, 'p2a_approve'))) throw new AppError('FEATURE_DISABLED', 'Không tìm thấy');
}

/** Kế hoạch đề xuất (agent hoặc người dùng). Không chạy gì, không ghi Meta. Sau cờ `p2a_approve`. */
export async function createActionPlan(
  ctx: ActorCtx,
  input: {
    adAccountId: string;
    title: string;
    steps: unknown;
    source: 'agent' | 'user';
    agentMessageId?: string | null;
  },
  clock: Clock = systemClock,
): Promise<ActionPlan> {
  await assertFlag(ctx);
  if (!(await listAdAccounts(ctx)).some((a) => a.id === input.adAccountId)) throw notFound('Tài khoản');
  const steps = parsePlanSteps(input.steps);
  const now = clock.now();
  const [row] = await ctx.db
    .insert(actionPlans)
    .values({
      workspaceId: ctx.workspaceId,
      adAccountId: input.adAccountId,
      title: input.title.trim().slice(0, 200) || 'Kế hoạch',
      source: input.source,
      agentMessageId: input.agentMessageId ?? null,
      createdBy: ctx.actor.userId,
      steps,
      results: steps.map((s) => ({ key: s.key, status: 'pending' })),
      expiresAt: new Date(now.getTime() + PLAN_TTL_MS),
      createdAt: now,
    })
    .returning();
  return row!;
}

/** Kế hoạch của workspace mà người dùng xem được (tài khoản QC trong phạm vi Client của họ). */
export async function getActionPlan(ctx: ActorCtx, id: string): Promise<ActionPlan> {
  await assertFlag(ctx);
  const [p] = await ctx.db
    .select()
    .from(actionPlans)
    .where(and(eq(actionPlans.workspaceId, ctx.workspaceId), eq(actionPlans.id, id)));
  if (!p || !(await listAdAccounts(ctx)).some((a) => a.id === p.adAccountId)) throw notFound('Kế hoạch');
  return p;
}

export async function listActionPlans(ctx: ActorCtx, limit = 20): Promise<ActionPlan[]> {
  await assertFlag(ctx);
  const visible = new Set((await listAdAccounts(ctx)).map((a) => a.id));
  const rows = await ctx.db
    .select()
    .from(actionPlans)
    .where(eq(actionPlans.workspaceId, ctx.workspaceId))
    .orderBy(desc(actionPlans.createdAt))
    .limit(limit * 3);
  return rows.filter((r) => visible.has(r.adAccountId)).slice(0, limit);
}

/** Bước → đầu vào Launcher. `created` = id do bước trước tạo (chỉ khi chạy). */
function launchInput(adAccountId: string, s: PlanStep, created: Map<string, string>): LaunchInput | null {
  if (s.kind === 'create_creative') {
    const { kind, draftId, pageId, link, message, headline, cta, name: n } = s;
    return { kind, adAccountId, draftId, pageId, link, message, headline, cta, name: n };
  }
  if (s.kind === 'create_adset') {
    const { kind, templateAdsetId, name: n, dailyBudget, countries, ageMin, ageMax, audienceIds } = s;
    return { kind, adAccountId, templateAdsetId, name: n, dailyBudget, countries, ageMin, ageMax, audienceIds };
  }
  const adsetId = isRef(s.adset) ? created.get(s.adset.ref) : s.adset;
  const creativeId = isRef(s.creative) ? created.get(s.creative.ref) : s.creative;
  if (!adsetId || !creativeId) return null;
  return { kind: 'create_ad', adAccountId, adsetId, creativeId, name: s.name };
}

export type PlanCheck = { key: string; ok: boolean; deferred?: boolean; code?: string; violations?: unknown };

/**
 * Kiểm trước khi duyệt (ADR-0031 mục 3): bước không có tham chiếu chạy đủ kiểm tra của Launcher; bước có tham chiếu
 * kiểm lúc chạy (`deferred`). Bước thứ n tính n − 1 bước trước vào giới hạn hành động / ngày.
 */
export async function checkActionPlan(
  ctx: ActorCtx,
  plan: ActionPlan,
  clock: Clock = systemClock,
): Promise<PlanCheck[]> {
  const steps = plan.steps as PlanStep[];
  const out: PlanCheck[] = [];
  for (const [i, s] of steps.entries()) {
    const input = launchInput(plan.adAccountId, s, new Map());
    if (!input) {
      out.push({ key: s.key, ok: true, deferred: true });
      continue;
    }
    try {
      await checkLaunch(ctx, input, { clock, extraActionsToday: i });
      out.push({ key: s.key, ok: true });
    } catch (e) {
      if (!(e instanceof AppError)) throw e;
      out.push({
        key: s.key,
        ok: false,
        code: e.code,
        violations: (e.details as { violations?: unknown })?.violations,
      });
    }
  }
  return out;
}

function assertApprover(ctx: ActorCtx, clientId: string | null) {
  if (!clientId ? ctx.actor.role === 'buyer' : !canApproveActions(ctx.actor, clientId)) {
    throw new AppError('FORBIDDEN', 'Bạn không có quyền duyệt hành động cho Client này');
  }
}

/** Duyệt một lần (ADR-0031 mục 2): kiểm mọi bước, rồi xếp job chạy tuần tự. Agent không bao giờ gọi hàm này. */
export async function approveActionPlan(
  ctx: ActorCtx,
  id: string,
  deps: { enqueue: Enqueue; clock?: Clock },
): Promise<{ plan: ActionPlan; checks: PlanCheck[] }> {
  const clock = deps.clock ?? systemClock;
  const plan = await getActionPlan(ctx, id);
  const account = (await listAdAccounts(ctx)).find((a) => a.id === plan.adAccountId)!;
  assertApprover(ctx, account.clientId);
  if (plan.status !== 'proposed') throw new AppError('CONFLICT', 'Kế hoạch đã được xử lý', { reason: plan.status });
  if (plan.expiresAt <= clock.now()) throw new AppError('CONFLICT', 'Kế hoạch đã hết hạn', { reason: 'expired' });
  const checks = await checkActionPlan(ctx, plan, clock);
  if (checks.some((c) => !c.ok)) throw new AppError('GUARDRAIL_VIOLATION', 'Kế hoạch có bước không hợp lệ', { checks });
  const [row] = await ctx.db
    .update(actionPlans)
    .set({ status: 'approved', approvedBy: ctx.actor.userId, approvedAt: clock.now(), updatedAt: clock.now() })
    .where(
      and(eq(actionPlans.workspaceId, ctx.workspaceId), eq(actionPlans.id, id), eq(actionPlans.status, 'proposed')),
    )
    .returning();
  if (!row) throw new AppError('CONFLICT', 'Kế hoạch đã được xử lý');
  await deps.enqueue('execute:plan', { workspaceId: ctx.workspaceId, planId: id });
  return { plan: row, checks };
}

export async function cancelActionPlan(ctx: ActorCtx, id: string, clock: Clock = systemClock): Promise<ActionPlan> {
  await getActionPlan(ctx, id);
  const [row] = await ctx.db
    .update(actionPlans)
    .set({ status: 'canceled', finishedAt: clock.now(), updatedAt: clock.now() })
    .where(
      and(eq(actionPlans.workspaceId, ctx.workspaceId), eq(actionPlans.id, id), eq(actionPlans.status, 'proposed')),
    )
    .returning();
  if (!row) throw new AppError('CONFLICT', 'Kế hoạch đã được xử lý');
  return row;
}

/**
 * Job `execute:plan` (ADR-0031 mục 4): từng bước tuần tự, mỗi bước là một hành động qua Execution Gateway (quyền của
 * người duyệt, guardrails, kill switch, xác minh). Một bước lỗi → dừng, các bước sau `skipped`. Cờ kiểm ở đầu job.
 */
export async function runActionPlan(
  ctx: WorkspaceCtx,
  planId: string,
  deps: ExecuteDeps,
): Promise<{ status: 'done' | 'failed' | 'skipped'; code?: string }> {
  const clock = deps.clock ?? systemClock;
  const [plan] = await ctx.db
    .update(actionPlans)
    .set({ status: 'running', updatedAt: clock.now() })
    .where(
      and(eq(actionPlans.workspaceId, ctx.workspaceId), eq(actionPlans.id, planId), eq(actionPlans.status, 'approved')),
    )
    .returning();
  if (!plan) return { status: 'skipped' };
  const steps = plan.steps as PlanStep[];
  const results: PlanStepResult[] = steps.map((s) => ({ key: s.key, status: 'pending' }));
  const save = (status?: 'done' | 'failed') =>
    ctx.db
      .update(actionPlans)
      .set({ results, updatedAt: clock.now(), ...(status ? { status, finishedAt: clock.now() } : {}) })
      .where(and(eq(actionPlans.workspaceId, ctx.workspaceId), eq(actionPlans.id, planId)));
  const fail = async (i: number, code: string) => {
    results[i] = { ...results[i]!, status: 'failed', code };
    for (let j = i + 1; j < results.length; j++) results[j] = { ...results[j]!, status: 'skipped' };
    await save('failed');
    return { status: 'failed' as const, code };
  };
  if (!(await isEnabled(ctx, 'p2a_approve'))) return fail(0, 'feature_disabled');
  const actor = plan.approvedBy ? await resolveActor(ctx.db, ctx.workspaceId, plan.approvedBy) : null;
  if (!actor) return fail(0, 'approver_missing');
  const actx = { ...ctx, actor };
  const created = new Map<string, string>();
  for (const [i, s] of steps.entries()) {
    const input = launchInput(plan.adAccountId, s, created);
    if (!input) return fail(i, 'missing_reference');
    let actionId: string;
    try {
      actionId = (await insertPlannedLaunch(actx, input, { clock, planId })).id;
    } catch (e) {
      return fail(i, e instanceof AppError ? e.code : 'step_invalid');
    }
    results[i] = { ...results[i]!, actionId };
    await executeAction(ctx, actionId, deps);
    const [a] = await ctx.db
      .select({ status: actions.status, resultCode: actions.resultCode, after: actions.afterState })
      .from(actions)
      .where(and(eq(actions.workspaceId, ctx.workspaceId), eq(actions.id, actionId)));
    const createdId = (a?.after as Record<string, string | null> | null)?.created_id;
    if (a?.status !== 'success' || !createdId) return fail(i, a?.resultCode ?? 'step_failed');
    created.set(s.key, createdId);
    results[i] = { ...results[i]!, status: 'success', createdId };
    await save();
  }
  await save('done');
  return { status: 'done' };
}
