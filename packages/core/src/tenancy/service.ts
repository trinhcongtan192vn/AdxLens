import { and, asc, eq, isNull, inArray } from 'drizzle-orm';
import type { Db, DbOrTx } from '@adxlens/db';
import { schema } from '@adxlens/db';
import {
  AppError,
  forbidden,
  notFound,
  randomToken,
  sha256,
  systemClock,
  type Actor,
  type ActorCtx,
  type Clock,
  type Role,
  type WorkspaceCtx,
} from '@adxlens/core/shared';
import { assertCan } from './permissions';

const { users, workspaces, memberships, clients, invitations, staff, auditEvents } = schema;

export const INVITATION_TTL_DAYS = 7;

export type WorkspaceSummary = { id: string; name: string; role: Role };

// ---------- Người dùng ----------

/** Đồng bộ hồ sơ từ Supabase auth sau khi đăng nhập/đăng ký. */
export async function upsertUser(
  db: DbOrTx,
  input: { id: string; email: string; fullName?: string | null; locale?: string },
): Promise<void> {
  await db
    .insert(users)
    .values({
      id: input.id,
      email: input.email.toLowerCase(),
      fullName: input.fullName ?? null,
      locale: input.locale ?? 'vi',
    })
    .onConflictDoUpdate({ target: users.id, set: { email: input.email.toLowerCase() } });
}

export async function updateProfile(
  db: DbOrTx,
  userId: string,
  patch: { fullName?: string | null; locale?: 'vi' | 'en' },
): Promise<void> {
  await db.update(users).set(patch).where(eq(users.id, userId));
}

export async function getUser(db: DbOrTx, userId: string) {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  return u ?? null;
}

export type StaffInfo = { role: (typeof schema.STAFF_ROLES)[number]; canEnableFlags: boolean };

/** Staff AdxLens (ADR-0013): `canEnableFlags` = superadmin. */
export async function isStaff(db: DbOrTx, userId: string): Promise<StaffInfo | null> {
  const [s] = await db.select().from(staff).where(eq(staff.userId, userId));
  return s ? { role: s.role, canEnableFlags: s.role === 'superadmin' } : null;
}

// ---------- Workspace ----------

/** Tạo workspace; người tạo thành owner. Thao tác duy nhất chưa có workspace_id từ trước. */
export async function createWorkspace(
  db: Db,
  input: { name: string; ownerUserId: string; locale?: string; timezone?: string; currency?: string },
) {
  const name = input.name.trim();
  if (!name) throw new AppError('VALIDATION_FAILED', 'Tên workspace không được trống');
  if (name.length > 120) throw new AppError('VALIDATION_FAILED', 'Tên workspace tối đa 120 ký tự');
  return db.transaction(async (tx) => {
    const [ws] = await tx
      .insert(workspaces)
      .values({
        name,
        defaultLocale: input.locale ?? 'vi',
        defaultTimezone: input.timezone ?? 'Asia/Ho_Chi_Minh',
        defaultCurrency: input.currency ?? 'VND',
      })
      .returning();
    if (!ws) throw new AppError('INTERNAL', 'Không tạo được workspace');
    await tx.insert(memberships).values({ workspaceId: ws.id, userId: input.ownerUserId, role: 'owner' });
    await tx.insert(auditEvents).values({
      workspaceId: ws.id,
      actorUserId: input.ownerUserId,
      event: 'workspace.created',
    });
    return ws;
  });
}

export async function listWorkspacesForUser(db: DbOrTx, userId: string): Promise<WorkspaceSummary[]> {
  return db
    .select({ id: workspaces.id, name: workspaces.name, role: memberships.role })
    .from(memberships)
    .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
    .where(eq(memberships.userId, userId))
    .orderBy(asc(workspaces.name));
}

/** Trả Actor nếu user là thành viên workspace; null nếu không (route trả 403/404). */
export async function resolveActor(db: DbOrTx, workspaceId: string, userId: string): Promise<Actor | null> {
  const [m] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId)));
  if (!m) return null;
  return {
    userId: m.userId,
    role: m.role,
    clientAccess: m.clientAccess,
    approveClientIds: m.approveClientIds,
  };
}

export async function getWorkspace(ctx: WorkspaceCtx) {
  const [ws] = await ctx.db.select().from(workspaces).where(eq(workspaces.id, ctx.workspaceId));
  if (!ws) throw notFound('Workspace');
  return ws;
}

export async function updateWorkspace(
  ctx: ActorCtx,
  patch: Partial<{
    name: string;
    defaultLocale: 'vi' | 'en';
    defaultTimezone: string;
    defaultCurrency: string;
    brand: schema.WorkspaceBrand;
    reportFromEmail: string | null;
  }>,
) {
  assertCan(ctx.actor, 'workspace.manage');
  if (patch.name !== undefined) {
    patch.name = patch.name.trim();
    if (!patch.name) throw new AppError('VALIDATION_FAILED', 'Tên workspace không được trống');
  }
  if (patch.brand?.primary_color && !/^#[0-9a-fA-F]{6}$/.test(patch.brand.primary_color)) {
    throw new AppError('VALIDATION_FAILED', 'Màu chủ đạo phải dạng #RRGGBB');
  }
  const [ws] = await ctx.db.update(workspaces).set(patch).where(eq(workspaces.id, ctx.workspaceId)).returning();
  if (!ws) throw notFound('Workspace');
  await ctx.db.insert(auditEvents).values({
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.actor.userId,
    event: 'workspace.updated',
    detail: { fields: Object.keys(patch) },
  });
  return ws;
}

/**
 * Xóa vĩnh viễn workspace (ST01 "Xóa workspace", chỉ owner). Phải nhập đúng tên để xác nhận. Dữ
 * liệu con xóa theo khóa ngoại cascade; token Meta bị xóa cùng kết nối (feature 014 bổ sung thu hồi).
 */
export async function deleteWorkspace(ctx: ActorCtx, confirmName: string): Promise<void> {
  if (ctx.actor.role !== 'owner') throw forbidden('Chỉ Owner xóa được workspace');
  const ws = await getWorkspace(ctx);
  if (confirmName.trim() !== ws.name) {
    throw new AppError('VALIDATION_FAILED', 'Tên xác nhận không khớp', { field: 'confirmName' });
  }
  for (const hook of workspaceDeleteHooks) await hook(ctx.db, ctx.workspaceId);
  await ctx.db.delete(workspaces).where(eq(workspaces.id, ctx.workspaceId));
}

type DeleteHook = (db: DbOrTx, workspaceId: string) => Promise<void>;
const workspaceDeleteHooks: DeleteHook[] = [];
/** Module khác đăng ký việc dọn dẹp trước khi xóa workspace (ví dụ thu hồi token Meta). */
export function onWorkspaceDelete(hook: DeleteHook): void {
  workspaceDeleteHooks.push(hook);
}

// ---------- Thành viên ----------

export async function listMembers(ctx: ActorCtx) {
  assertCan(ctx.actor, 'members.view');
  return ctx.db
    .select({
      userId: memberships.userId,
      email: users.email,
      fullName: users.fullName,
      role: memberships.role,
      clientAccess: memberships.clientAccess,
      approveClientIds: memberships.approveClientIds,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.workspaceId, ctx.workspaceId))
    .orderBy(asc(users.email));
}

async function assertClientsInWorkspace(ctx: WorkspaceCtx, clientIds: string[]): Promise<void> {
  if (clientIds.length === 0) return;
  const found = await ctx.db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.workspaceId, ctx.workspaceId), inArray(clients.id, clientIds)));
  if (found.length !== new Set(clientIds).size) {
    throw new AppError('VALIDATION_FAILED', 'Có Client không thuộc workspace');
  }
}

export async function updateMember(
  ctx: ActorCtx,
  userId: string,
  patch: { role?: Exclude<Role, 'owner'>; clientAccess?: string[]; approveClientIds?: string[] },
) {
  assertCan(ctx.actor, 'members.manage');
  const target = await resolveActor(ctx.db, ctx.workspaceId, userId);
  if (!target) throw notFound('Thành viên');
  if (target.role === 'owner') {
    throw new AppError('CONFLICT', 'Không đổi vai trò owner; dùng chuyển quyền owner');
  }
  await assertClientsInWorkspace(ctx, [...(patch.clientAccess ?? []), ...(patch.approveClientIds ?? [])]);
  await ctx.db
    .update(memberships)
    .set(patch)
    .where(and(eq(memberships.workspaceId, ctx.workspaceId), eq(memberships.userId, userId)));
  await ctx.db.insert(auditEvents).values({
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.actor.userId,
    event: 'member.updated',
    detail: { userId, ...patch },
  });
}

export async function removeMember(ctx: ActorCtx, userId: string): Promise<void> {
  assertCan(ctx.actor, 'members.manage');
  const target = await resolveActor(ctx.db, ctx.workspaceId, userId);
  if (!target) throw notFound('Thành viên');
  if (target.role === 'owner') throw new AppError('CONFLICT', 'Không xóa được owner');
  await ctx.db
    .delete(memberships)
    .where(and(eq(memberships.workspaceId, ctx.workspaceId), eq(memberships.userId, userId)));
  await ctx.db.insert(auditEvents).values({
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.actor.userId,
    event: 'member.removed',
    detail: { userId },
  });
}

/** ADR-0001 B8: owner chuyển quyền cho một manager hiện có; owner cũ thành manager. */
export async function transferOwnership(ctx: ActorCtx & { db: Db }, toUserId: string): Promise<void> {
  assertCan(ctx.actor, 'ownership.transfer');
  if (toUserId === ctx.actor.userId) throw new AppError('BAD_REQUEST', 'Đã là owner');
  await ctx.db.transaction(async (tx) => {
    const target = await resolveActor(tx, ctx.workspaceId, toUserId);
    if (!target) throw notFound('Thành viên');
    if (target.role !== 'manager') {
      throw new AppError('CONFLICT', 'Chỉ chuyển quyền owner cho thành viên vai trò manager');
    }
    const scope = eq(memberships.workspaceId, ctx.workspaceId);
    await tx
      .update(memberships)
      .set({ role: 'owner', clientAccess: [] })
      .where(and(scope, eq(memberships.userId, toUserId)));
    await tx
      .update(memberships)
      .set({ role: 'manager' })
      .where(and(scope, eq(memberships.userId, ctx.actor.userId)));
    await tx.insert(auditEvents).values({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.actor.userId,
      event: 'ownership.transferred',
      detail: { from: ctx.actor.userId, to: toUserId },
    });
  });
}

// ---------- Lời mời ----------

export async function createInvitation(
  ctx: ActorCtx,
  input: { email: string; role: Exclude<Role, 'owner'>; clientAccess?: string[] },
  clock: Clock = systemClock,
): Promise<{ id: string; token: string; expiresAt: Date }> {
  assertCan(ctx.actor, 'members.manage');
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new AppError('VALIDATION_FAILED', 'Email không hợp lệ');
  }
  await assertClientsInWorkspace(ctx, input.clientAccess ?? []);
  const existing = await ctx.db
    .select({ userId: memberships.userId })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.workspaceId, ctx.workspaceId), eq(users.email, email)));
  if (existing.length) throw new AppError('CONFLICT', 'Email đã là thành viên');
  // Một email chỉ có một lời mời đang chờ: lời mời cũ bị thu hồi.
  await ctx.db
    .update(invitations)
    .set({ revokedAt: clock.now() })
    .where(
      and(
        eq(invitations.workspaceId, ctx.workspaceId),
        eq(invitations.email, email),
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
      ),
    );

  const token = randomToken();
  const expiresAt = new Date(clock.now().getTime() + INVITATION_TTL_DAYS * 86_400_000);
  const [inv] = await ctx.db
    .insert(invitations)
    .values({
      workspaceId: ctx.workspaceId,
      email,
      role: input.role,
      clientAccess: input.clientAccess ?? [],
      tokenHash: sha256(token),
      invitedBy: ctx.actor.userId,
      expiresAt,
    })
    .returning({ id: invitations.id });
  if (!inv) throw new AppError('INTERNAL', 'Không tạo được lời mời');
  return { id: inv.id, token, expiresAt };
}

/** Lời mời chưa chấp nhận (gồm cả đã hết hạn, để ST02 hiện "Gửi lại"). */
export async function listPendingInvitations(ctx: ActorCtx, clock: Clock = systemClock) {
  assertCan(ctx.actor, 'members.view');
  const rows = await ctx.db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      clientAccess: invitations.clientAccess,
      createdAt: invitations.createdAt,
      expiresAt: invitations.expiresAt,
    })
    .from(invitations)
    .where(
      and(eq(invitations.workspaceId, ctx.workspaceId), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)),
    )
    .orderBy(asc(invitations.createdAt));
  const now = clock.now();
  return rows.map((r) => ({ ...r, expired: r.expiresAt <= now }));
}

/** Gửi lại lời mời: token mới, hạn mới 7 ngày; token cũ hết hiệu lực. */
export async function resendInvitation(
  ctx: ActorCtx,
  invitationId: string,
  clock: Clock = systemClock,
): Promise<{ token: string; email: string; role: Exclude<Role, 'owner'>; expiresAt: Date }> {
  assertCan(ctx.actor, 'members.manage');
  const token = randomToken();
  const expiresAt = new Date(clock.now().getTime() + INVITATION_TTL_DAYS * 86_400_000);
  const [inv] = await ctx.db
    .update(invitations)
    .set({ tokenHash: sha256(token), expiresAt, createdAt: clock.now() })
    .where(
      and(
        eq(invitations.workspaceId, ctx.workspaceId),
        eq(invitations.id, invitationId),
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
      ),
    )
    .returning({ email: invitations.email, role: invitations.role });
  if (!inv) throw notFound('Lời mời');
  return { token, email: inv.email, role: inv.role === 'manager' ? 'manager' : 'buyer', expiresAt };
}

export async function revokeInvitation(ctx: ActorCtx, invitationId: string): Promise<void> {
  assertCan(ctx.actor, 'members.manage');
  await ctx.db
    .update(invitations)
    .set({ revokedAt: new Date() })
    .where(and(eq(invitations.workspaceId, ctx.workspaceId), eq(invitations.id, invitationId)));
}

/**
 * Xem lời mời bằng token (trang A06) mà không tiết lộ gì khi token sai. Lời mời hợp lệ trả thêm
 * người mời, vai trò, Client được gán, số ngày còn hiệu lực (Penpot A06).
 */
export async function peekInvitation(db: DbOrTx, token: string, clock: Clock = systemClock) {
  const [row] = await db
    .select({
      email: invitations.email,
      role: invitations.role,
      clientAccess: invitations.clientAccess,
      expiresAt: invitations.expiresAt,
      acceptedAt: invitations.acceptedAt,
      revokedAt: invitations.revokedAt,
      workspaceId: invitations.workspaceId,
      workspaceName: workspaces.name,
      invitedBy: invitations.invitedBy,
    })
    .from(invitations)
    .innerJoin(workspaces, eq(workspaces.id, invitations.workspaceId))
    .where(eq(invitations.tokenHash, sha256(token)));
  if (!row || row.revokedAt || row.acceptedAt) return { status: 'invalid' as const };
  if (row.expiresAt <= clock.now()) return { status: 'expired' as const, workspaceName: row.workspaceName };

  const [inviter] = await db
    .select({ fullName: users.fullName, email: users.email, role: memberships.role })
    .from(users)
    .leftJoin(memberships, and(eq(memberships.userId, users.id), eq(memberships.workspaceId, row.workspaceId)))
    .where(eq(users.id, row.invitedBy));
  const clientNames = row.clientAccess.length
    ? (
        await db
          .select({ name: clients.name })
          .from(clients)
          .where(and(eq(clients.workspaceId, row.workspaceId), inArray(clients.id, row.clientAccess)))
          .orderBy(asc(clients.name))
      ).map((c) => c.name)
    : [];
  return {
    status: 'valid' as const,
    email: row.email,
    role: row.role,
    workspaceName: row.workspaceName,
    inviterName: inviter?.fullName ?? inviter?.email ?? null,
    inviterRole: inviter?.role ?? null,
    clientNames,
    // Danh sách rỗng = mọi Client chỉ với manager; buyer rỗng = chưa được gán Client nào.
    allClients: row.clientAccess.length === 0 && row.role !== 'buyer',
    daysLeft: Math.max(1, Math.ceil((row.expiresAt.getTime() - clock.now().getTime()) / 86_400_000)),
  };
}

/** Có tài khoản AdxLens với email này chưa (A06: người mới đặt mật khẩu, người cũ đăng nhập). */
export async function userExistsByEmail(db: DbOrTx, email: string): Promise<boolean> {
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, email.toLowerCase()));
  return Boolean(u);
}

/** Chấp nhận lời mời: email đăng nhập phải trùng email được mời. */
export async function acceptInvitation(
  db: Db,
  input: { token: string; userId: string; email: string },
  clock: Clock = systemClock,
): Promise<{ workspaceId: string }> {
  return db.transaction(async (tx) => {
    const [inv] = await tx
      .select()
      .from(invitations)
      .where(eq(invitations.tokenHash, sha256(input.token)))
      .for('update');
    if (!inv || inv.revokedAt || inv.acceptedAt) throw notFound('Lời mời');
    if (inv.expiresAt <= clock.now()) throw new AppError('CONFLICT', 'Lời mời đã hết hạn');
    if (inv.email !== input.email.toLowerCase()) {
      throw forbidden('Lời mời dành cho email khác');
    }
    await tx
      .insert(memberships)
      .values({
        workspaceId: inv.workspaceId,
        userId: input.userId,
        role: inv.role,
        clientAccess: inv.clientAccess,
      })
      .onConflictDoNothing();
    await tx.update(invitations).set({ acceptedAt: clock.now() }).where(eq(invitations.id, inv.id));
    await tx.insert(auditEvents).values({
      workspaceId: inv.workspaceId,
      actorUserId: input.userId,
      event: 'invitation.accepted',
      detail: { role: inv.role },
    });
    return { workspaceId: inv.workspaceId };
  });
}
