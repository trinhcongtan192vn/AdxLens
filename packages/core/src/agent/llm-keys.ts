import { and, desc, eq } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import { decryptSecret, encryptSecret, type TokenKeys } from '@adxlens/core/connections';
import { AppError, notFound, type ActorCtx, type WorkspaceCtx } from '@adxlens/core/shared';
import { openaiImageClient, type ImageGenerator } from './creative-image';
import { anthropicAgentClient, deepseekAgentClient, geminiAgentClient, openaiAgentClient, type AgentLlm } from './llm';
import { resolveRoute, type LlmTask } from './router';

const { llmKeys, llmRoutes, auditEvents } = schema;

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

const INFO = {
  provider: llmKeys.provider,
  model: llmKeys.model,
  keyHint: llmKeys.keyHint,
  lastUsedAt: llmKeys.lastUsedAt,
  lastError: llmKeys.lastError,
  updatedAt: llmKeys.updatedAt,
};

/** Mọi khóa của workspace, mới nhất trước (không bao giờ có khóa rõ hay bản mã). ADR-0030: một khóa / nhà cung cấp. */
export async function listLlmKeys(ctx: ActorCtx): Promise<LlmKeyInfo[]> {
  assertManager(ctx);
  return ctx.db
    .select(INFO)
    .from(llmKeys)
    .where(eq(llmKeys.workspaceId, ctx.workspaceId))
    .orderBy(desc(llmKeys.updatedAt));
}

/** Khóa đang trả lời AI agent (tuyến `analysis`, ADR-0030); không có khóa → null. */
export async function getLlmKey(ctx: ActorCtx): Promise<LlmKeyInfo | null> {
  assertManager(ctx);
  const route = await resolveRoute(ctx, 'analysis');
  if (!route) return null;
  return (await listLlmKeys(ctx)).find((k) => k.provider === route.provider) ?? null;
}

/**
 * Lưu / thay khóa của một nhà cung cấp (ADR-0030: khóa nhà cung cấp khác giữ nguyên). `apiKey` bỏ trống = giữ khóa cũ,
 * chỉ đổi model. Web chỉ mã hóa (ADR-0022); nhật ký ghi nhà cung cấp, model, 4 ký tự cuối.
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
    .where(and(eq(llmKeys.workspaceId, ctx.workspaceId), eq(llmKeys.provider, input.provider)));
  if (!apiKey) {
    if (!existing) throw new AppError('VALIDATION_FAILED', 'Nhập khóa API');
    await ctx.db
      .update(llmKeys)
      .set({ model, updatedBy: ctx.actor.userId, updatedAt: new Date() })
      .where(and(eq(llmKeys.workspaceId, ctx.workspaceId), eq(llmKeys.provider, input.provider)));
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
      .onConflictDoUpdate({ target: [llmKeys.workspaceId, llmKeys.provider], set: values });
  }
  const info = (await listLlmKeys(ctx)).find((k) => k.provider === input.provider)!;
  await ctx.db.insert(auditEvents).values({
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.actor.userId,
    event: 'llm_key.saved',
    detail: { provider: info.provider, model: info.model, keyHint: info.keyHint, keyChanged: Boolean(apiKey) },
  });
  return info;
}

/**
 * Xóa khóa của một nhà cung cấp, hoặc mọi khóa khi không truyền. Lựa chọn model đang trỏ tới nhà cung cấp bị xóa cũng
 * bị xóa (ADR-0030 mục 3).
 */
export async function deleteLlmKey(ctx: ActorCtx, provider?: LlmProvider): Promise<void> {
  assertManager(ctx);
  const only = provider ? eq(llmKeys.provider, provider) : undefined;
  const rows = await ctx.db
    .delete(llmKeys)
    .where(and(eq(llmKeys.workspaceId, ctx.workspaceId), only))
    .returning({ provider: llmKeys.provider, keyHint: llmKeys.keyHint });
  if (!rows.length) throw notFound('Khóa AI');
  await ctx.db
    .delete(llmRoutes)
    .where(and(eq(llmRoutes.workspaceId, ctx.workspaceId), provider ? eq(llmRoutes.provider, provider) : undefined));
  for (const row of rows) {
    await ctx.db.insert(auditEvents).values({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.actor.userId,
      event: 'llm_key.deleted',
      detail: { provider: row.provider, keyHint: row.keyHint },
    });
  }
}

/** Workspace đã có khóa riêng chưa (mọi vai trò; không lộ gì về khóa) — để ẩn banner "chưa cấu hình". */
export async function hasWorkspaceLlmKey(ctx: WorkspaceCtx): Promise<boolean> {
  const [row] = await ctx.db.select({ id: llmKeys.id }).from(llmKeys).where(eq(llmKeys.workspaceId, ctx.workspaceId));
  return Boolean(row);
}

async function loadKey(ctx: WorkspaceCtx, provider: LlmProvider, keys: TokenKeys): Promise<string | null> {
  const [row] = await ctx.db
    .select({ keyCiphertext: llmKeys.keyCiphertext, keyVersion: llmKeys.keyVersion })
    .from(llmKeys)
    .where(and(eq(llmKeys.workspaceId, ctx.workspaceId), eq(llmKeys.provider, provider)));
  return row ? decryptSecret(row.keyCiphertext, row.keyVersion, keys) : null;
}

/** Bọc một lần gọi: ghi lần dùng / mã lỗi gần nhất lên khóa của nhà cung cấp (trang cài đặt báo "khóa sai"). */
function tracked<T>(ctx: WorkspaceCtx, provider: LlmProvider, call: () => Promise<T>): Promise<T> {
  const mark = (lastError: string | null) =>
    ctx.db
      .update(llmKeys)
      .set(lastError ? { lastError } : { lastError: null, lastUsedAt: new Date() })
      .where(and(eq(llmKeys.workspaceId, ctx.workspaceId), eq(llmKeys.provider, provider)));
  return call().then(
    async (r) => {
      await mark(null);
      return r;
    },
    async (e: unknown) => {
      await mark(e instanceof Error && /^LLM_[A-Z0-9_]+$/.test(e.message) ? e.message : 'LLM_ERROR');
      throw e;
    },
  );
}

/**
 * CHỈ worker (ADR-0030): client LLM cho một việc chat (`analysis` | `copywriting`) theo tuyến của workspace; giải mã
 * khóa tại đây. Không có tuyến → null (worker dùng khóa nền tảng cho `analysis`; `copywriting` không có tính năng).
 */
export async function routedAgentLlm(
  ctx: WorkspaceCtx,
  keys: TokenKeys,
  task: Exclude<LlmTask, 'image'>,
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<{ llm: AgentLlm; provider: LlmProvider; model: string } | null> {
  const route = await resolveRoute(ctx, task);
  if (!route) return null;
  const apiKey = await loadKey(ctx, route.provider, keys);
  if (!apiKey) return null;
  const inner = CLIENTS[route.provider]({
    apiKey,
    model: route.model,
    ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
  });
  const llm: AgentLlm = { chat: (input) => tracked(ctx, route.provider, () => inner.chat(input)) };
  return { llm, provider: route.provider, model: route.model };
}

/** CHỈ worker: client cho AI agent (tuyến `analysis`). Không có khóa riêng → null (dùng khóa nền tảng). */
export function workspaceAgentLlm(ctx: WorkspaceCtx, keys: TokenKeys, opts: { fetchImpl?: typeof fetch } = {}) {
  return routedAgentLlm(ctx, keys, 'analysis', opts);
}

/**
 * CHỈ worker (ADR-0027, 0030): bộ tạo ảnh theo tuyến `image` (khóa OpenAI của workspace, giải mã tại đây). Không có tuyến
 * → null. Không bao giờ dùng khóa nền tảng.
 */
export async function workspaceImageGenerator(
  ctx: WorkspaceCtx,
  keys: TokenKeys,
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<ImageGenerator | null> {
  const route = await resolveRoute(ctx, 'image');
  if (!route || route.provider !== 'openai') return null;
  const apiKey = await loadKey(ctx, route.provider, keys);
  if (!apiKey) return null;
  const inner = openaiImageClient({
    apiKey,
    model: route.model,
    ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
  });
  return { generate: (prompt) => tracked(ctx, route.provider, () => inner.generate(prompt)) };
}
