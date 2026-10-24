import { createHash, randomBytes } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import { AppError, notFound, type ActorCtx } from '@adxlens/core/shared';

const { apiKeys, auditEvents } = schema;

export const API_KEY_SCOPES = schema.API_KEY_SCOPES;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];
/** Tối đa khóa đang hoạt động mỗi workspace. */
export const MAX_API_KEYS = 20;

/** SHA-256 hex của khóa rõ — dạng duy nhất được lưu (ADR-0020). */
export function hashApiKey(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

function assertManager(ctx: ActorCtx) {
  if (ctx.actor.role !== 'owner' && ctx.actor.role !== 'manager') {
    throw new AppError('FORBIDDEN', 'Chỉ Owner / Manager quản lý khóa API');
  }
}

export type ApiKeyRow = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdBy: string;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

/** Danh sách khóa (không có hash, không có khóa rõ). */
export async function listApiKeys(ctx: ActorCtx): Promise<ApiKeyRow[]> {
  assertManager(ctx);
  return ctx.db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      scopes: apiKeys.scopes,
      createdBy: apiKeys.createdBy,
      lastUsedAt: apiKeys.lastUsedAt,
      revokedAt: apiKeys.revokedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.workspaceId, ctx.workspaceId))
    .orderBy(desc(apiKeys.createdAt));
}

/** Tạo khóa: trả khóa rõ MỘT lần (`adx_<prefix>_<secret>`), chỉ lưu hash; ghi nhật ký. */
export async function createApiKey(
  ctx: ActorCtx,
  input: { name: string; scopes: ApiKeyScope[] },
): Promise<{ id: string; key: string; prefix: string }> {
  assertManager(ctx);
  const name = input.name.trim();
  if (!name || name.length > 60) throw new AppError('VALIDATION_FAILED', 'Tên khóa 1–60 ký tự');
  const scopes = [...new Set(['read', ...input.scopes])] as ApiKeyScope[];
  if (scopes.some((s) => !(API_KEY_SCOPES as readonly string[]).includes(s))) {
    throw new AppError('VALIDATION_FAILED', 'Phạm vi không hợp lệ');
  }
  const active = await ctx.db
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(and(eq(apiKeys.workspaceId, ctx.workspaceId), isNull(apiKeys.revokedAt)));
  if (active.length >= MAX_API_KEYS) throw new AppError('CONFLICT', `Tối đa ${MAX_API_KEYS} khóa đang hoạt động`);
  const prefix = randomBytes(6).toString('base64url').slice(0, 8);
  const key = `adx_${prefix}_${randomBytes(24).toString('base64url')}`;
  const [row] = await ctx.db
    .insert(apiKeys)
    .values({ workspaceId: ctx.workspaceId, createdBy: ctx.actor.userId, name, prefix, hash: hashApiKey(key), scopes })
    .returning({ id: apiKeys.id });
  await ctx.db.insert(auditEvents).values({
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.actor.userId,
    event: 'api_key.created',
    detail: { keyId: row!.id, name, prefix, scopes },
  });
  return { id: row!.id, key, prefix };
}

export async function revokeApiKey(ctx: ActorCtx, id: string): Promise<void> {
  assertManager(ctx);
  const [row] = await ctx.db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.workspaceId, ctx.workspaceId), eq(apiKeys.id, id), isNull(apiKeys.revokedAt)))
    .returning({ id: apiKeys.id, prefix: apiKeys.prefix });
  if (!row) throw notFound('Khóa API');
  await ctx.db.insert(auditEvents).values({
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.actor.userId,
    event: 'api_key.revoked',
    detail: { keyId: id, prefix: row.prefix },
  });
}
