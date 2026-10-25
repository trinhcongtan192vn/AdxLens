import { and, desc, eq } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import { AppError, notFound, type ActorCtx, type WorkspaceCtx } from '@adxlens/core/shared';

const { llmKeys, llmRoutes, auditEvents } = schema;

/** Việc AI (ADR-0030): phân tích (agent chat), viết nội dung quảng cáo, tạo ảnh. */
export const LLM_TASKS = schema.LLM_TASKS;
export type LlmTask = (typeof LLM_TASKS)[number];
type Provider = (typeof schema.LLM_PROVIDERS)[number];

/** Nhà cung cấp làm được từng việc. Tạo ảnh hiện chỉ OpenAI Images. */
export const TASK_PROVIDERS: Record<LlmTask, readonly Provider[]> = {
  analysis: schema.LLM_PROVIDERS,
  copywriting: schema.LLM_PROVIDERS,
  image: ['openai'],
};

/** Model tạo ảnh hợp lệ (danh sách đóng — không nhận tên tùy ý cho việc tốn tiền theo ảnh). */
export const IMAGE_MODELS: Partial<Record<Provider, readonly string[]>> = { openai: ['gpt-image-1'] };

const MODEL_PATTERN = /^[a-zA-Z0-9][\w.:-]{1,79}$/;

export type ResolvedRoute = {
  task: LlmTask;
  provider: Provider;
  model: string;
  /** `route`: PM / Owner chọn; `default`: suy ra từ khóa (ADR-0030 mục 3). */
  source: 'route' | 'default';
};

async function keysOf(ctx: WorkspaceCtx) {
  return ctx.db
    .select({ provider: llmKeys.provider, model: llmKeys.model })
    .from(llmKeys)
    .where(eq(llmKeys.workspaceId, ctx.workspaceId))
    .orderBy(desc(llmKeys.updatedAt));
}

async function routesOf(ctx: WorkspaceCtx) {
  return ctx.db
    .select({ task: llmRoutes.task, provider: llmRoutes.provider, model: llmRoutes.model })
    .from(llmRoutes)
    .where(eq(llmRoutes.workspaceId, ctx.workspaceId));
}

/**
 * Tuyến hiệu lực của mọi việc. Route trỏ tới nhà cung cấp đã mất khóa thì bỏ qua (về mặc định). Không có khóa phù hợp
 * → không có trong kết quả (agent `analysis` khi đó dùng khóa nền tảng ở worker; việc khác không có tính năng).
 */
export async function resolveRoutes(ctx: WorkspaceCtx): Promise<Partial<Record<LlmTask, ResolvedRoute>>> {
  const [keys, routes] = await Promise.all([keysOf(ctx), routesOf(ctx)]);
  const has = new Set(keys.map((k) => k.provider));
  const out: Partial<Record<LlmTask, ResolvedRoute>> = {};
  const set = (task: LlmTask) => {
    const r = routes.find((x) => x.task === task);
    if (r && has.has(r.provider) && TASK_PROVIDERS[task].includes(r.provider)) {
      out[task] = { task, provider: r.provider, model: r.model, source: 'route' };
    }
  };
  set('analysis');
  if (!out.analysis) {
    const k = keys.find((x) => TASK_PROVIDERS.analysis.includes(x.provider));
    if (k) out.analysis = { task: 'analysis', provider: k.provider, model: k.model, source: 'default' };
  }
  set('copywriting');
  if (!out.copywriting && out.analysis) out.copywriting = { ...out.analysis, task: 'copywriting', source: 'default' };
  set('image');
  if (!out.image && has.has('openai')) {
    out.image = { task: 'image', provider: 'openai', model: IMAGE_MODELS.openai![0]!, source: 'default' };
  }
  return out;
}

export async function resolveRoute(ctx: WorkspaceCtx, task: LlmTask): Promise<ResolvedRoute | null> {
  return (await resolveRoutes(ctx))[task] ?? null;
}

/** Workspace tạo được ảnh AI không (có tuyến `image`) — UI ẩn "AI tạo ảnh" khi không. Không lộ gì về khóa. */
export async function canGenerateImages(ctx: WorkspaceCtx): Promise<boolean> {
  return (await resolveRoute(ctx, 'image')) !== null;
}

function assertManager(ctx: ActorCtx) {
  if (ctx.actor.role !== 'owner' && ctx.actor.role !== 'manager') {
    throw new AppError('FORBIDDEN', 'Chỉ Owner / Manager quản lý khóa AI');
  }
}

/** Bảng định tuyến cho trang cài đặt (Owner / Manager). */
export async function listLlmRoutes(ctx: ActorCtx): Promise<Partial<Record<LlmTask, ResolvedRoute>>> {
  assertManager(ctx);
  return resolveRoutes(ctx);
}

/** Chọn model cho một việc. Nhà cung cấp phải làm được việc đó và đã có khóa của workspace. */
export async function saveLlmRoute(
  ctx: ActorCtx,
  input: { task: LlmTask; provider: Provider; model: string },
): Promise<ResolvedRoute> {
  assertManager(ctx);
  if (!(LLM_TASKS as readonly string[]).includes(input.task))
    throw new AppError('VALIDATION_FAILED', 'Việc không hợp lệ');
  if (!TASK_PROVIDERS[input.task].includes(input.provider)) {
    throw new AppError('VALIDATION_FAILED', 'Nhà cung cấp này không làm được việc đã chọn');
  }
  const model = input.model.trim();
  const allowed = input.task === 'image' ? IMAGE_MODELS[input.provider] : null;
  if (!MODEL_PATTERN.test(model) || (allowed && !allowed.includes(model))) {
    throw new AppError('VALIDATION_FAILED', 'Tên model không hợp lệ');
  }
  const [key] = await ctx.db
    .select({ id: llmKeys.id })
    .from(llmKeys)
    .where(and(eq(llmKeys.workspaceId, ctx.workspaceId), eq(llmKeys.provider, input.provider)));
  if (!key) throw new AppError('VALIDATION_FAILED', 'Chưa có khóa của nhà cung cấp này');
  const values = { provider: input.provider, model, updatedBy: ctx.actor.userId, updatedAt: new Date() };
  await ctx.db
    .insert(llmRoutes)
    .values({ workspaceId: ctx.workspaceId, task: input.task, ...values })
    .onConflictDoUpdate({ target: [llmRoutes.workspaceId, llmRoutes.task], set: values });
  await ctx.db.insert(auditEvents).values({
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.actor.userId,
    event: 'llm_route.saved',
    detail: { task: input.task, provider: input.provider, model },
  });
  return { task: input.task, provider: input.provider, model, source: 'route' };
}

/** Bỏ lựa chọn của một việc → về mặc định. */
export async function deleteLlmRoute(ctx: ActorCtx, task: LlmTask): Promise<void> {
  assertManager(ctx);
  const rows = await ctx.db
    .delete(llmRoutes)
    .where(and(eq(llmRoutes.workspaceId, ctx.workspaceId), eq(llmRoutes.task, task)))
    .returning({ id: llmRoutes.id });
  if (!rows.length) throw notFound('Lựa chọn model');
  await ctx.db.insert(auditEvents).values({
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.actor.userId,
    event: 'llm_route.deleted',
    detail: { task },
  });
}
