import { z } from 'zod';
import { deleteLlmKey, getLlmKey, LLM_PROVIDERS, saveLlmKey, type LlmKeyInfo } from '@adxlens/core/agent';
import { tokenKeys } from '@/server/meta';
import { route } from '@/server/route';

const out = (k: LlmKeyInfo | null) =>
  k
    ? {
        provider: k.provider,
        model: k.model,
        key_hint: k.keyHint,
        last_used_at: k.lastUsedAt?.toISOString() ?? null,
        last_error: k.lastError,
        updated_at: k.updatedAt.toISOString(),
      }
    : null;

/** Khóa AI tự mang của workspace (ADR-0022). Không bao giờ trả khóa rõ hay bản mã. Sau cờ P1. */
export const GET = route({
  auth: 'workspace',
  flag: 'p1_recommendations',
  handler: async (ctx) => ({ key: out(await getLlmKey(ctx)) }),
});

/** Lưu / thay khóa. Web chỉ mã hóa; worker giải mã khi chạy agent. `api_key` bỏ trống = chỉ đổi model. */
export const PUT = route({
  auth: 'workspace',
  flag: 'p1_recommendations',
  body: z.object({
    provider: z.enum(LLM_PROVIDERS),
    model: z.string().trim().min(2).max(80),
    api_key: z.string().trim().max(400).optional().nullable(),
  }),
  handler: async (ctx, { body }) => ({
    key: out(await saveLlmKey(ctx, { provider: body.provider, model: body.model, apiKey: body.api_key }, tokenKeys())),
  }),
});

export const DELETE = route({
  auth: 'workspace',
  flag: 'p1_recommendations',
  handler: async (ctx) => {
    await deleteLlmKey(ctx);
    return null;
  },
});
