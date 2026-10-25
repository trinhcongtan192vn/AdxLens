import { eq } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import type { Enqueue } from '@adxlens/jobs';
import {
  addCreativeDraft,
  finishCreativeDraft,
  generatingDraftCount,
  pendingCreativeDraft,
  sniffCreativeImage,
  type CreativeDraft,
} from '@adxlens/core/execution';
import { isEnabled } from '@adxlens/core/flags';
import { AppError, type ActorCtx, type WorkspaceCtx } from '@adxlens/core/shared';

/** Tối đa ảnh AI đang tạo cùng lúc mỗi workspace (ADR-0027: chặn chi phí AI ngoài ý muốn). */
export const AI_IMAGE_MAX_PENDING = 3;

export type ImageGenerator = { generate(prompt: string): Promise<Uint8Array> };

/**
 * OpenAI Images (khóa workspace tự mang, ADR-0022 / 0027). Chỉ worker gọi; lỗi chỉ mang mã HTTP (không khóa, không nội
 * dung trả về).
 */
export function openaiImageClient(cfg: { apiKey: string; model?: string; fetchImpl?: typeof fetch }): ImageGenerator {
  const f = cfg.fetchImpl ?? fetch;
  return {
    async generate(prompt) {
      const res = await f('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({ model: cfg.model ?? 'gpt-image-1', prompt, size: '1024x1024', n: 1 }),
      });
      if (!res.ok) throw new Error(`LLM_HTTP_${res.status}`);
      const data = (await res.json()) as { data?: { b64_json?: string }[] };
      const b64 = data.data?.[0]?.b64_json;
      if (!b64) throw new Error('LLM_EMPTY_IMAGE');
      return new Uint8Array(Buffer.from(b64, 'base64'));
    },
  };
}

/** Nhà cung cấp khóa AI của workspace (không lộ gì về khóa) — UI ẩn "AI tạo ảnh" khi không phải OpenAI. */
export async function workspaceLlmProvider(ctx: WorkspaceCtx): Promise<string | null> {
  const [row] = await ctx.db
    .select({ provider: schema.llmKeys.provider })
    .from(schema.llmKeys)
    .where(eq(schema.llmKeys.workspaceId, ctx.workspaceId));
  return row?.provider ?? null;
}

/** Người dùng yêu cầu tạo ảnh: bản nháp `generating` + job worker. Cần khóa OpenAI của workspace. */
export async function requestAiImage(
  ctx: ActorCtx,
  input: { adAccountId: string; prompt: string },
  deps: { enqueue: Enqueue },
): Promise<CreativeDraft> {
  if ((await workspaceLlmProvider(ctx)) !== 'openai') {
    throw new AppError('CONFLICT', 'Cần khóa OpenAI của workspace', { reason: 'no_openai_key' });
  }
  const prompt = input.prompt.trim();
  if (prompt.length < 5 || prompt.length > 1000) throw new AppError('VALIDATION_FAILED', 'Mô tả 5–1000 ký tự');
  if ((await generatingDraftCount(ctx)) >= AI_IMAGE_MAX_PENDING) {
    throw new AppError('CONFLICT', 'Đang tạo nhiều ảnh, chờ xong rồi thử lại', { reason: 'too_many' });
  }
  const draft = await addCreativeDraft(ctx, {
    adAccountId: input.adAccountId,
    source: 'ai',
    status: 'generating',
    prompt,
  });
  await deps.enqueue('recommend:creative_image', { workspaceId: ctx.workspaceId, draftId: draft.id });
  return draft;
}

/**
 * Worker tạo ảnh cho một bản nháp (job `recommend:creative_image`). Kiểm cờ đầu job (quy tắc 7). Không có khóa OpenAI
 * → `failed`. Ảnh lưu `<workspace>/<tài khoản>/<bản nháp>.png` ở bucket private `creatives`.
 */
export async function runAiImage(
  ctx: WorkspaceCtx,
  draftId: string,
  deps: {
    generator: ImageGenerator | null;
    save: (path: string, bytes: Uint8Array, contentType: string) => Promise<void>;
  },
): Promise<{ status: 'ready' | 'failed' | 'missing'; code?: string }> {
  const draft = await pendingCreativeDraft(ctx, draftId);
  if (!draft) return { status: 'missing' };
  const fail = async (code: string) => {
    await finishCreativeDraft(ctx, draftId, { status: 'failed', error: code });
    return { status: 'failed' as const, code };
  };
  if (!(await isEnabled(ctx, 'p2a_approve'))) return fail('feature_disabled');
  if (!deps.generator) return fail('no_openai_key');
  let bytes: Uint8Array;
  try {
    bytes = await deps.generator.generate(draft.prompt ?? '');
  } catch (e) {
    return fail(e instanceof Error && /^LLM_[A-Z0-9_]+$/.test(e.message) ? e.message : 'image_failed');
  }
  const type = sniffCreativeImage(bytes);
  if (!type) return fail('image_invalid');
  const path = `${ctx.workspaceId}/${draft.adAccountId}/${draft.id}.${type === 'image/png' ? 'png' : type === 'image/jpeg' ? 'jpg' : 'webp'}`;
  await deps.save(path, bytes, type);
  await finishCreativeDraft(ctx, draftId, { status: 'ready', storagePath: path, contentType: type });
  return { status: 'ready' };
}
