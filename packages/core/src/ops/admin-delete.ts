import { and, eq, sql } from 'drizzle-orm';
import type { DbOrTx } from '@adxlens/db';
import { schema } from '@adxlens/db';
import { AppError, notFound } from '@adxlens/core/shared';
import { assertSuperadmin, recordAdminAction, type StaffActor } from './staff';

const { workspaces, memberships, users, staff } = schema;

/** Nhật ký chỉ-thêm: giữ lại làm lịch sử kiểm toán (không xóa theo workspace / user). */
const KEEP_TABLES = new Set(['app.admin_audit_log', 'app.flag_change_log']);

function requireReason(reason: string) {
  const r = reason.trim();
  if (r.length < 5) throw new AppError('VALIDATION_FAILED', 'Cần nhập lý do (≥ 5 ký tự)');
  return r;
}

/** Bảng có cột `col` trong schema app / analytics (đọc từ DB để không sót bảng mới). */
async function tablesWith(db: DbOrTx, col: 'workspace_id' | 'user_id'): Promise<string[]> {
  const rows = await db.execute<{ t: string }>(sql`
    select format('%I.%I', c.table_schema, c.table_name) as t from information_schema.columns c
    join information_schema.tables tb using (table_schema, table_name)
    where tb.table_type = 'BASE TABLE' and c.column_name = ${col} and c.table_schema in ('app', 'analytics')
    order by 1`);
  return rows.map((r) => r.t).filter((t) => !KEEP_TABLES.has(t));
}

/**
 * Xóa các dòng `col = id` ở mọi bảng. Một số bảng tham chiếu nhau không cascade (vd. hành động → gợi ý): xóa theo
 * nhiều lượt, mỗi bảng trong savepoint riêng; bảng bị khóa ngoại chặn thì thử lại ở lượt sau.
 */
async function deleteEverywhere(tx: DbOrTx, tables: string[], col: 'workspace_id' | 'user_id', id: string) {
  let pending = tables;
  while (pending.length) {
    const failed: string[] = [];
    for (const t of pending) {
      try {
        await tx.transaction(async (sp) => {
          await sp.execute(sql`delete from ${sql.raw(t)} where ${sql.raw(col)} = ${id}`);
        });
      } catch {
        failed.push(t);
      }
    }
    if (failed.length === pending.length) {
      throw new AppError('CONFLICT', 'Không xóa được dữ liệu liên quan', { tables: failed });
    }
    pending = failed;
  }
}

/**
 * Superadmin xóa vĩnh viễn một workspace từ trang admin. XUYÊN WORKSPACE có chủ đích (CLAUDE.md quy tắc 1): staff thao
 * tác hỗ trợ / dọn dữ liệu, chỉ route staff gọi. Phải gõ đúng tên workspace, có lý do.
 * - Xóa mọi dòng có `workspace_id` (kể cả analytics, kết nối Meta → token bị xóa theo).
 * - Nhật ký admin / nhật ký cờ giữ lại.
 * - Ghi nhật ký admin `workspace.deleted`.
 */
export async function adminDeleteWorkspace(
  db: DbOrTx,
  actor: StaffActor,
  input: { workspaceId: string; confirmName: string; reason: string },
): Promise<void> {
  assertSuperadmin(actor, 'Chỉ superadmin xóa workspace');
  const reason = requireReason(input.reason);
  const [ws] = await db
    .select({ id: workspaces.id, name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.id, input.workspaceId));
  if (!ws) throw notFound('Workspace');
  if (input.confirmName.trim() !== ws.name) {
    throw new AppError('VALIDATION_FAILED', 'Tên xác nhận không khớp', { field: 'confirm' });
  }
  const members = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(eq(memberships.workspaceId, ws.id));
  const tables = (await tablesWith(db, 'workspace_id')).filter((t) => t !== 'app.workspaces');
  await db.transaction(async (tx) => {
    await deleteEverywhere(tx, tables, 'workspace_id', ws.id);
    await tx.delete(workspaces).where(eq(workspaces.id, ws.id));
    await recordAdminAction(tx, {
      actorUserId: actor.userId,
      action: 'workspace.deleted',
      targetType: 'workspace',
      targetId: ws.id,
      workspaceId: ws.id,
      reason,
      detail: { name: ws.name, members: members.length },
    });
  });
}

/**
 * Superadmin xóa tài khoản người dùng (app + đăng nhập). Không xóa: chính mình, tài khoản staff (gỡ quyền staff trước),
 * người đang là Owner của workspace (xóa workspace hoặc chuyển quyền Owner trước). Phải gõ đúng email, có lý do.
 * `deleteLogin` xóa tài khoản đăng nhập ở Supabase Auth (route truyền vào; core không gọi Supabase).
 */
export async function adminDeleteUser(
  db: DbOrTx,
  actor: StaffActor,
  input: { userId: string; confirmEmail: string; reason: string },
  deps: { deleteLogin: (userId: string) => Promise<void> },
): Promise<void> {
  assertSuperadmin(actor, 'Chỉ superadmin xóa tài khoản');
  const reason = requireReason(input.reason);
  if (input.userId === actor.userId) throw new AppError('CONFLICT', 'Không tự xóa tài khoản của mình');
  const [u] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, input.userId));
  if (!u) throw notFound('Tài khoản');
  if (input.confirmEmail.trim().toLowerCase() !== u.email.toLowerCase()) {
    throw new AppError('VALIDATION_FAILED', 'Email xác nhận không khớp', { field: 'confirm' });
  }
  const [isStaff] = await db.select({ userId: staff.userId }).from(staff).where(eq(staff.userId, u.id));
  if (isStaff) throw new AppError('CONFLICT', 'Đây là tài khoản staff: gỡ quyền staff trước');
  const owned = await db
    .select({ name: workspaces.name })
    .from(memberships)
    .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
    .where(and(eq(memberships.userId, u.id), eq(memberships.role, 'owner')));
  if (owned.length) {
    throw new AppError('CONFLICT', 'Người này là Owner: xóa workspace hoặc chuyển quyền Owner trước', {
      workspaces: owned.map((w) => w.name),
    });
  }
  const tables = (await tablesWith(db, 'user_id')).filter((t) => t !== 'app.users');
  await db.transaction(async (tx) => {
    await deleteEverywhere(tx, tables, 'user_id', u.id);
    await tx.delete(users).where(eq(users.id, u.id));
    await recordAdminAction(tx, {
      actorUserId: actor.userId,
      action: 'user.deleted',
      targetType: 'user',
      targetId: u.id,
      reason,
      detail: { email: u.email },
    });
  });
  // Sau khi dữ liệu app đã xóa: xóa đăng nhập (lỗi ở đây → người đó không còn vào được workspace nào).
  await deps.deleteLogin(u.id);
}
