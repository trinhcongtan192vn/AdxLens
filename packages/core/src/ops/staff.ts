import { and, asc, desc, eq, ne, sql } from 'drizzle-orm';
import type { DbOrTx } from '@adxlens/db';
import { schema } from '@adxlens/db';
import { AppError, forbidden, notFound } from '@adxlens/core/shared';

const { staff, users, adminAuditLog } = schema;

export type StaffRole = (typeof schema.STAFF_ROLES)[number];
/** Staff đang thao tác (ADR-0013). */
export type StaffActor = { userId: string; role: StaffRole };

export function assertSuperadmin(actor: StaffActor, why = 'Chỉ superadmin') {
  if (actor.role !== 'superadmin') throw forbidden(why);
}

export type AdminActionInput = {
  actorUserId: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  workspaceId?: string | null;
  reason?: string | null;
  /** Chỉ dữ liệu vận hành (id, trạng thái cũ/mới). Không bao giờ ghi token hay body request. */
  detail?: Record<string, unknown>;
};

/** Ghi một dòng nhật ký admin (append-only, ADR-0013 mục 4). */
export async function recordAdminAction(db: DbOrTx, input: AdminActionInput): Promise<void> {
  await db.insert(adminAuditLog).values({
    actorUserId: input.actorUserId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    workspaceId: input.workspaceId ?? null,
    reason: input.reason ?? null,
    detail: input.detail ?? {},
  });
}

/**
 * Nhật ký admin cho trang `/admin/audit`. XUYÊN WORKSPACE có chủ đích (CLAUDE.md quy tắc 1): chỉ route staff gọi;
 * operator chỉ xem dòng của chính mình (`onlyActor`).
 */
export async function listAdminAudit(
  db: DbOrTx,
  opts: { onlyActor?: string; action?: string; workspaceId?: string; limit?: number } = {},
) {
  return db
    .select({
      id: adminAuditLog.id,
      at: adminAuditLog.at,
      action: adminAuditLog.action,
      targetType: adminAuditLog.targetType,
      targetId: adminAuditLog.targetId,
      workspaceId: adminAuditLog.workspaceId,
      reason: adminAuditLog.reason,
      detail: adminAuditLog.detail,
      actorUserId: adminAuditLog.actorUserId,
      actorEmail: users.email,
    })
    .from(adminAuditLog)
    .leftJoin(users, eq(users.id, adminAuditLog.actorUserId))
    .where(
      and(
        opts.onlyActor ? eq(adminAuditLog.actorUserId, opts.onlyActor) : undefined,
        opts.action ? eq(adminAuditLog.action, opts.action) : undefined,
        opts.workspaceId ? eq(adminAuditLog.workspaceId, opts.workspaceId) : undefined,
      ),
    )
    .orderBy(desc(adminAuditLog.at))
    .limit(Math.min(opts.limit ?? 200, 500));
}

export async function listStaff(db: DbOrTx) {
  return db
    .select({
      userId: staff.userId,
      role: staff.role,
      email: users.email,
      fullName: users.fullName,
      createdAt: staff.createdAt,
    })
    .from(staff)
    .innerJoin(users, eq(users.id, staff.userId))
    .orderBy(asc(staff.role), asc(users.email));
}

async function superadminCount(db: DbOrTx, exceptUserId: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(staff)
    .where(and(eq(staff.role, 'superadmin'), ne(staff.userId, exceptUserId)));
  return r?.n ?? 0;
}

const roleValues = (role: StaffRole) => ({ role, canEnableFlags: role === 'superadmin' });

function requireReason(reason: string) {
  const r = reason.trim();
  if (r.length < 5) throw new AppError('VALIDATION_FAILED', 'Cần nhập lý do (≥ 5 ký tự)');
  return r;
}

/** Thêm staff theo email người dùng AdxLens đã có tài khoản (superadmin). */
export async function addStaff(
  db: DbOrTx,
  actor: StaffActor,
  input: { email: string; role: StaffRole; reason: string },
) {
  assertSuperadmin(actor);
  const reason = requireReason(input.reason);
  const email = input.email.trim().toLowerCase();
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (!u) throw new AppError('NOT_FOUND', 'Chưa có tài khoản AdxLens với email này (người đó cần đăng ký trước)');
  const [exists] = await db.select({ userId: staff.userId }).from(staff).where(eq(staff.userId, u.id));
  if (exists) throw new AppError('CONFLICT', 'Người này đã là staff');
  await db.insert(staff).values({ userId: u.id, ...roleValues(input.role) });
  await recordAdminAction(db, {
    actorUserId: actor.userId,
    action: 'staff.add',
    targetType: 'staff',
    targetId: u.id,
    reason,
    detail: { email, role: input.role },
  });
  return { userId: u.id, role: input.role };
}

/** Đổi vai trò (superadmin). Không tự đổi vai trò mình; không hạ superadmin cuối cùng. */
export async function setStaffRole(
  db: DbOrTx,
  actor: StaffActor,
  input: { userId: string; role: StaffRole; reason: string },
) {
  assertSuperadmin(actor);
  const reason = requireReason(input.reason);
  if (input.userId === actor.userId) throw new AppError('CONFLICT', 'Không tự đổi vai trò của mình');
  const [s] = await db.select().from(staff).where(eq(staff.userId, input.userId));
  if (!s) throw notFound('Staff');
  if (s.role === input.role) return { userId: s.userId, role: s.role };
  if (s.role === 'superadmin' && (await superadminCount(db, s.userId)) === 0) {
    throw new AppError('CONFLICT', 'Phải còn ít nhất một superadmin');
  }
  await db.update(staff).set(roleValues(input.role)).where(eq(staff.userId, input.userId));
  await recordAdminAction(db, {
    actorUserId: actor.userId,
    action: 'staff.role',
    targetType: 'staff',
    targetId: input.userId,
    reason,
    detail: { from: s.role, to: input.role },
  });
  return { userId: input.userId, role: input.role };
}

/** Gỡ quyền staff (superadmin). Không tự gỡ mình; không gỡ superadmin cuối cùng. */
export async function removeStaff(db: DbOrTx, actor: StaffActor, input: { userId: string; reason: string }) {
  assertSuperadmin(actor);
  const reason = requireReason(input.reason);
  if (input.userId === actor.userId) throw new AppError('CONFLICT', 'Không tự gỡ quyền của mình');
  const [s] = await db.select().from(staff).where(eq(staff.userId, input.userId));
  if (!s) throw notFound('Staff');
  if (s.role === 'superadmin' && (await superadminCount(db, s.userId)) === 0) {
    throw new AppError('CONFLICT', 'Phải còn ít nhất một superadmin');
  }
  await db.delete(staff).where(eq(staff.userId, input.userId));
  await recordAdminAction(db, {
    actorUserId: actor.userId,
    action: 'staff.remove',
    targetType: 'staff',
    targetId: input.userId,
    reason,
    detail: { role: s.role },
  });
}
