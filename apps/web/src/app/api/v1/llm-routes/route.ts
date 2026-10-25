import { z } from 'zod';
import {
  deleteLlmRoute,
  listLlmKeys,
  listLlmRoutes,
  LLM_PROVIDERS,
  LLM_TASKS,
  saveLlmRoute,
  type LlmKeyInfo,
} from '@adxlens/core/agent';
import { route } from '@/server/route';

const shape = (r: Awaited<ReturnType<typeof listLlmRoutes>>) =>
  Object.values(r).map((x) => ({ task: x!.task, provider: x!.provider, model: x!.model, source: x!.source }));

const keyOut = (k: LlmKeyInfo) => ({
  provider: k.provider,
  model: k.model,
  key_hint: k.keyHint,
  last_used_at: k.lastUsedAt?.toISOString() ?? null,
  last_error: k.lastError,
  updated_at: k.updatedAt.toISOString(),
});

/**
 * AI router (ADR-0030): mọi khóa của workspace (không bao giờ có khóa rõ) + model hiệu lực theo việc (phân tích, viết
 * nội dung, tạo ảnh). Owner / Manager. Sau cờ P1.
 */
export const GET = route({
  auth: 'workspace',
  flag: 'p1_recommendations',
  handler: async (ctx) => {
    const [keys, routes] = await Promise.all([listLlmKeys(ctx), listLlmRoutes(ctx)]);
    return { keys: keys.map(keyOut), routes: shape(routes) };
  },
});

/** Chọn nhà cung cấp + model cho một việc (nhà cung cấp phải đã có khóa của workspace). */
export const PUT = route({
  auth: 'workspace',
  flag: 'p1_recommendations',
  body: z.object({
    task: z.enum(LLM_TASKS),
    provider: z.enum(LLM_PROVIDERS),
    model: z.string().trim().min(2).max(80),
  }),
  handler: async (ctx, { body }) => {
    await saveLlmRoute(ctx, body);
    return { routes: shape(await listLlmRoutes(ctx)) };
  },
});

/** Bỏ lựa chọn của một việc → về mặc định theo khóa. */
export const DELETE = route({
  auth: 'workspace',
  flag: 'p1_recommendations',
  query: z.object({ task: z.enum(LLM_TASKS) }),
  handler: async (ctx, { query }) => {
    await deleteLlmRoute(ctx, query.task);
    return { routes: shape(await listLlmRoutes(ctx)) };
  },
});
