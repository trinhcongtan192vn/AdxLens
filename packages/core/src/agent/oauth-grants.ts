import { and, desc, eq, isNull } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import { isEnabled } from '@adxlens/core/flags';
import { newOAuthToken, OAUTH_CODE_TTL_SECONDS, sha256Hex } from '@adxlens/core/ops';
import { AppError, notFound, type ActorCtx } from '@adxlens/core/shared';
import { API_KEY_SCOPES, type ApiKeyScope } from './api-keys';

const { oauthGrants, oauthClients, auditEvents } = schema;

const isManager = (ctx: ActorCtx) => ctx.actor.role === 'owner' || ctx.actor.role === 'manager';

/** Phạm vi từ chuỗi `scope` của OAuth: luôn có `read`, bỏ giá trị lạ. */
export function oauthScopes(raw: string | null | undefined): ApiKeyScope[] {
  const asked = (raw ?? '')
    .split(/\s+/)
    .filter((s): s is ApiKeyScope => (API_KEY_SCOPES as readonly string[]).includes(s));
  return [...new Set<ApiKeyScope>(['read', ...asked])];
}

/**
 * Người dùng bấm "Cho phép" ở trang cấp quyền (ADR-0022 B): tạo grant cho workspace hiện tại với quyền của người đó, trả
 * mã cấp quyền dùng một lần. Client và redirect_uri đã được route kiểm qua `core/ops`. Cần cờ P1 (quy tắc 7).
 */
export async function createAuthorizationCode(
  ctx: ActorCtx,
  input: { clientId: string; clientName: string; redirectUri: string; codeChallenge: string; scopes: ApiKeyScope[] },
  now: Date = new Date(),
): Promise<string> {
  if (!(await isEnabled(ctx, 'p1_recommendations'))) throw new AppError('FEATURE_DISABLED', 'Không tìm thấy');
  if (!/^[\w-]{43}$/.test(input.codeChallenge)) throw new AppError('VALIDATION_FAILED', 'code_challenge không hợp lệ');
  const code = newOAuthToken('adxc');
  const [g] = await ctx.db
    .insert(oauthGrants)
    .values({
      workspaceId: ctx.workspaceId,
      userId: ctx.actor.userId,
      clientId: input.clientId,
      scopes: input.scopes,
      redirectUri: input.redirectUri,
      codeHash: sha256Hex(code),
      codeChallenge: input.codeChallenge,
      codeExpiresAt: new Date(now.getTime() + OAUTH_CODE_TTL_SECONDS * 1000),
    })
    .returning({ id: oauthGrants.id });
  await ctx.db.insert(auditEvents).values({
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.actor.userId,
    event: 'oauth.granted',
    detail: { grantId: g!.id, clientId: input.clientId, clientName: input.clientName, scopes: input.scopes },
  });
  return code;
}

export type OAuthGrantRow = {
  id: string;
  clientName: string;
  userId: string;
  scopes: string[];
  lastUsedAt: Date | null;
  createdAt: Date;
  mine: boolean;
};

/** Ứng dụng đã kết nối: của mình; Owner / Manager thấy mọi grant trong workspace. Chỉ grant đã đổi ra token. */
export async function listOAuthGrants(ctx: ActorCtx): Promise<OAuthGrantRow[]> {
  const rows = await ctx.db
    .select({
      id: oauthGrants.id,
      clientName: oauthClients.name,
      userId: oauthGrants.userId,
      scopes: oauthGrants.scopes,
      lastUsedAt: oauthGrants.lastUsedAt,
      createdAt: oauthGrants.createdAt,
      refreshHash: oauthGrants.refreshHash,
    })
    .from(oauthGrants)
    .innerJoin(oauthClients, eq(oauthClients.id, oauthGrants.clientId))
    .where(
      and(
        eq(oauthGrants.workspaceId, ctx.workspaceId),
        isNull(oauthGrants.revokedAt),
        ...(isManager(ctx) ? [] : [eq(oauthGrants.userId, ctx.actor.userId)]),
      ),
    )
    .orderBy(desc(oauthGrants.createdAt));
  return rows
    .filter((r) => r.refreshHash !== null)
    .map(({ refreshHash: _r, ...r }) => ({ ...r, mine: r.userId === ctx.actor.userId }));
}

/** Thu hồi (có hiệu lực ngay): người cấp, hoặc Owner / Manager. */
export async function revokeOAuthGrant(ctx: ActorCtx, id: string, now: Date = new Date()): Promise<void> {
  const [g] = await ctx.db
    .select({ id: oauthGrants.id, userId: oauthGrants.userId, clientId: oauthGrants.clientId })
    .from(oauthGrants)
    .where(and(eq(oauthGrants.workspaceId, ctx.workspaceId), eq(oauthGrants.id, id), isNull(oauthGrants.revokedAt)));
  if (!g || (g.userId !== ctx.actor.userId && !isManager(ctx))) throw notFound('Ứng dụng đã kết nối');
  await ctx.db
    .update(oauthGrants)
    .set({ revokedAt: now, codeHash: null, accessHash: null, refreshHash: null })
    .where(and(eq(oauthGrants.workspaceId, ctx.workspaceId), eq(oauthGrants.id, id)));
  await ctx.db.insert(auditEvents).values({
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.actor.userId,
    event: 'oauth.revoked',
    detail: { grantId: id, clientId: g.clientId },
  });
}
