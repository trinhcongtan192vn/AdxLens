import { eq } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import { decryptSecret, encryptSecret, type TokenKeys } from '@adxlens/core/connections';
import { AppError, notFound, type ActorCtx, type WorkspaceCtx } from '@adxlens/core/shared';
import { anthropicAgentClient, deepseekAgentClient, geminiAgentClient, openaiAgentClient, type AgentLlm } from './llm';

const { llmKeys, auditEvents } = schema;

export const LLM_PROVIDERS = schema.LLM_PROVIDERS;
export type LlmProvider = (typeof LLM_PROVIDERS)[number];

/** Model gợi ý cho từng nhà cung cấp; người dùng nhập được model khác (tên theo tài khoản của họ). */
export const LLM_MODELS: Record<LlmProvider, readonly string[]> = {
  anthropic: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5', 'claude-fable-5-1', 'claude-sonnet-4-5'],
  openai: ['gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'gpt-4.1', 'gpt-4.1-mini', 'o4-mini'],
  gemini: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
};

const CLIENTS: Record<LlmProvider, (cfg: { apiKey: string; model: string; fetchImpl?: typeof fetch }) => AgentLlm> = {
  anthropic: anthropicAgentClient,
  openai: openaiAgentClient,
  gemini: geminiAgentClient,
  deepseek: deepseekAgentClient,
};

/** Dạng khóa của từng nhà cung cấp — chặn dán nhầm (vd. khóa OpenAI vào ô Anthropic). */
const KEY_PATTERN: Record<LlmProvider, RegExp> = {
  anthropic: /^sk-ant-[\w-]{20,}$/,
  openai: /^sk-(?!ant-)[\w-]{20,}$/,
  gemini: /^AIza[\w-]{30,}$/,
  deepseek: /^sk-(?!ant-)[\w-]{20,}$/,
};

const MODEL_PATTERN = /^[a-zA-Z0-9][\w.:-]{1,79}$/;

function assertManager(ctx: ActorCtx) {
  if (ctx.actor.role !== 'owner' && ctx.actor.role !== 'manager') {
    throw new AppError('FORBIDDEN', 'Chỉ Owner / Manager quản lý khóa AI');
  }
}

export type LlmKeyInfo = {
  provider: LlmProvider;
  model: string;
  keyHint: string;
  lastUsedAt: Date | null;
  lastError: string | null;
  updatedAt: Date;
};

/** Thông tin khóa (không bao giờ có khóa rõ hay bản mã). */
export async function getLlmKey(ctx: ActorCtx): Promise<LlmKeyInfo | null> {
  assertManager(ctx);
  const [row] = await ctx.db
    .select({
      provider: llmKeys.provider,
      model: llmKeys.model,
      keyHint: llmKeys.keyHint,
      lastUsedAt: llmKeys.lastUsedAt,
      lastError: llmKeys.lastError,
      updatedAt: llmKeys.updatedAt,
    })
    .from(llmKeys)
    .where(eq(llmKeys.workspaceId, ctx.workspaceId));
  return row ?? null;
}

/**
 * Lưu / thay khóa của workspace. `apiKey` bỏ trống = giữ khóa cũ, chỉ đổi model (cùng nhà cung cấp). Web chỉ mã hóa
 * (ADR-0022); nhật ký ghi nhà cung cấp, model, 4 ký tự cuối.
 */
export async function saveLlmKey(
  ctx: ActorCtx,
  input: { provider: LlmProvider; model: string; apiKey?: string | null },
  keys: { keys: TokenKeys; current: number },
): Promise<LlmKeyInfo> {
  assertManager(ctx);
  if (!(LLM_PROVIDERS as readonly string[]).includes(input.provider)) {
    throw new AppError('VALIDATION_FAILED', 'Nhà cung cấp không hợp lệ');
  }
  const model = input.model.trim();
  if (!MODEL_PATTERN.test(model)) throw new AppError('VALIDATION_FAILED', 'Tên model không hợp lệ');
  const apiKey = input.apiKey?.trim() ?? '';
  const [existing] = await ctx.db
    .select({ provider: llmKeys.provider })
    .from(llmKeys)
    .where(eq(llmKeys.workspaceId, ctx.workspaceId));
  if (!apiKey) {
    if (!existing || existing.provider !== input.provider) {
      throw new AppError('VALIDATION_FAILED', 'Nhập khóa API');
    }
    await ctx.db
      .update(llmKeys)
      .set({ model, updatedBy: ctx.actor.userId, updatedAt: new Date() })
      .where(eq(llmKeys.workspaceId, ctx.workspaceId));
  } else {
    if (!KEY_PATTERN[input.provider].test(apiKey)) {
      throw new AppError('VALIDATION_FAILED', 'Khóa API không đúng dạng của nhà cung cấp đã chọn');
    }
    const { blob, version } = encryptSecret(apiKey, keys);
    const values = {
      provider: input.provider,
      model,
      keyCiphertext: blob,
      keyVersion: version,
      keyHint: apiKey.slice(-4),
      updatedBy: ctx.actor.userId,
      lastError: null,
      lastUsedAt: null,
      updatedAt: new Date(),
    };
    await ctx.db
      .insert(llmKeys)
      .values({ workspaceId: ctx.workspaceId, ...values })
      .onConflictDoUpdate({ target: llmKeys.workspaceId, set: values });
  }
  const info = (await getLlmKey(ctx))!;
  await ctx.db.insert(auditEvents).values({
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.actor.userId,
    event: 'llm_key.saved',
    detail: { provider: info.provider, model: info.model, keyHint: info.keyHint, keyChanged: Boolean(apiKey) },
  });
  return info;
}

export async function deleteLlmKey(ctx: ActorCtx): Promise<void> {
  assertManager(ctx);
  const [row] = await ctx.db
    .delete(llmKeys)
    .where(eq(llmKeys.workspaceId, ctx.workspaceId))
    .returning({ provider: llmKeys.provider, keyHint: llmKeys.keyHint });
  if (!row) throw notFound('Khóa AI');
  await ctx.db.insert(auditEvents).values({
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.actor.userId,
    event: 'llm_key.deleted',
    detail: { provider: row.provider, keyHint: row.keyHint },
  });
}

/** Workspace đã có khóa riêng chưa (mọi vai trò; không lộ gì về khóa) — để ẩn banner "chưa cấu hình". */
export async function hasWorkspaceLlmKey(ctx: WorkspaceCtx): Promise<boolean> {
  const [row] = await ctx.db.select({ id: llmKeys.id }).from(llmKeys).where(eq(llmKeys.workspaceId, ctx.workspaceId));
  return Boolean(row);
}

/**
 * CHỈ worker: dựng client LLM từ khóa của workspace (giải mã tại đây). Ghi lần dùng / mã lỗi gần nhất để trang cài đặt
 * báo "khóa sai / hết hạn mức". Không có khóa → null (worker dùng khóa nền tảng nếu có).
 */
export async function workspaceAgentLlm(
  ctx: WorkspaceCtx,
  keys: TokenKeys,
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<{ llm: AgentLlm; provider: LlmProvider; model: string } | null> {
  const [row] = await ctx.db
    .select({
      provider: llmKeys.provider,
      model: llmKeys.model,
      keyCiphertext: llmKeys.keyCiphertext,
      keyVersion: llmKeys.keyVersion,
    })
    .from(llmKeys)
    .where(eq(llmKeys.workspaceId, ctx.workspaceId));
  if (!row) return null;
  const apiKey = decryptSecret(row.keyCiphertext, row.keyVersion, keys);
  const inner = CLIENTS[row.provider]({
    apiKey,
    model: row.model,
    ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
  });
  const mark = (lastError: string | null) =>
    ctx.db
      .update(llmKeys)
      .set(lastError ? { lastError } : { lastError: null, lastUsedAt: new Date() })
      .where(eq(llmKeys.workspaceId, ctx.workspaceId));
  const llm: AgentLlm = {
    async chat(input) {
      try {
        const r = await inner.chat(input);
        await mark(null);
        return r;
      } catch (e) {
        await mark(e instanceof Error && /^LLM_[A-Z0-9_]+$/.test(e.message) ? e.message : 'LLM_ERROR');
        throw e;
      }
    },
  };
  return { llm, provider: row.provider, model: row.model };
}
