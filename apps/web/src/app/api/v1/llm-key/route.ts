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

/**
 * Khóa AI tự mang của workspace (ADR-0022, 0030: một khóa / nhà cung cấp). `key` = khóa đang trả lời agent (mọi khóa +
 * tuyến: `/api/v1/llm-routes`). Không bao giờ trả khóa rõ hay bản mã. Sau cờ P1.
 */
export const GET = route({
  auth: 'workspace',
  flag: 'p1_recommendations',
  handler: async (ctx) => ({ key: out(await getLlmKey(ctx)) }),
});

/** Lưu / thay khóa của một nhà cung cấp. Web chỉ mã hóa; worker giải mã. `api_key` bỏ trống = chỉ đổi model. */
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

/** Xóa khóa của `provider`, hoặc mọi khóa khi không truyền. */
export const DELETE = route({
  auth: 'workspace',
  flag: 'p1_recommendations',
  query: z.object({ provider: z.enum(LLM_PROVIDERS).optional() }),
  handler: async (ctx, { query }) => {
    await deleteLlmKey(ctx, query.provider);
    return null;
  },
});
