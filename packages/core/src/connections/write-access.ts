import { and, eq } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import { AppError, systemClock, type ActorCtx, type Clock, type WorkspaceCtx } from '@adxlens/core/shared';
import { assertCan } from '@adxlens/core/tenancy';

const { metaConnections } = schema;

export const WRITE_SCOPE = 'ads_management';

/** P201: quyền ghi của từng kết nối (không trả token). */
export async function listWriteAccess(ctx: ActorCtx) {
  assertCan(ctx.actor, 'write_scope.manage');
  const rows = await ctx.db
    .select({
      id: metaConnections.id,
      metaUserName: metaConnections.metaUserName,
      scopes: metaConnections.scopes,
      status: metaConnections.status,
      isDemo: metaConnections.isDemo,
      writeEnabled: metaConnections.writeEnabled,
      writeChangedAt: metaConnections.writeChangedAt,
    })
    .from(metaConnections)
    .where(eq(metaConnections.workspaceId, ctx.workspaceId));
  return rows.map((r) => ({
    id: r.id,
    metaUserName: r.metaUserName,
    status: r.status,
    isDemo: r.isDemo,
    hasWriteScope: r.scopes.includes(WRITE_SCOPE),
    writeEnabled: r.writeEnabled,
    writeChangedAt: r.writeChangedAt,
  }));
}

/**
 * Bật / thu hồi quyền ghi trong AdxLens (P2-01). Bật cần scope `ads_management` đã cấp qua OAuth nâng quyền;
 * thu hồi có hiệu lực ngay (gateway kiểm tra trước mỗi lần ghi). Kết nối mẫu không bao giờ có quyền ghi.
 */
export async function setWriteEnabled(
  ctx: ActorCtx,
  connectionId: string,
  enabled: boolean,
  clock: Clock = systemClock,
): Promise<void> {
  assertCan(ctx.actor, 'write_scope.manage');
  const [c] = await ctx.db
    .select()
    .from(metaConnections)
    .where(and(eq(metaConnections.workspaceId, ctx.workspaceId), eq(metaConnections.id, connectionId)));
  if (!c) throw new AppError('NOT_FOUND', 'Không tìm thấy kết nối');
  if (enabled && (c.isDemo || c.status !== 'active' || !c.scopes.includes(WRITE_SCOPE))) {
    throw new AppError('CONFLICT', 'Kết nối chưa được cấp quyền quản lý quảng cáo trên Meta');
  }
  await ctx.db
    .update(metaConnections)
    .set({ writeEnabled: enabled, writeChangedAt: clock.now() })
    .where(and(eq(metaConnections.workspaceId, ctx.workspaceId), eq(metaConnections.id, connectionId)));
}

/** Gateway (ADR-0008 bước 3): kết nối còn hoạt động, có scope ghi và quyền ghi đang bật. */
export async function connectionCanWrite(ctx: WorkspaceCtx, connectionId: string): Promise<boolean> {
  const [c] = await ctx.db
    .select({
      scopes: metaConnections.scopes,
      status: metaConnections.status,
      writeEnabled: metaConnections.writeEnabled,
      isDemo: metaConnections.isDemo,
    })
    .from(metaConnections)
    .where(and(eq(metaConnections.workspaceId, ctx.workspaceId), eq(metaConnections.id, connectionId)));
  return Boolean(c && !c.isDemo && c.status === 'active' && c.writeEnabled && c.scopes.includes(WRITE_SCOPE));
}
