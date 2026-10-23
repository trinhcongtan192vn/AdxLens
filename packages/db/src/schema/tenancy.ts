import { sql } from 'drizzle-orm';
import { boolean, index, integer, jsonb, primaryKey, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { app, createdAt, tsz, updatedAt } from './_common';

export type WorkspaceBrand = {
  logo_path?: string;
  primary_color?: string;
  display_name?: string;
};

/** Bản sao hồ sơ người dùng từ Supabase auth.users. Bảng duy nhất không có workspace_id (L3 5.1). */
export const users = app.table('users', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull(),
  fullName: text('full_name'),
  locale: text('locale').notNull().default('vi'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const workspaces = app.table('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  defaultLocale: text('default_locale').notNull().default('vi'),
  defaultTimezone: text('default_timezone').notNull().default('Asia/Ho_Chi_Minh'),
  /** A07 "Tiền tệ báo cáo"; số liệu từng tài khoản vẫn theo tiền tệ của tài khoản trên Meta. */
  defaultCurrency: text('default_currency').notNull().default('VND'),
  brand: jsonb('brand').$type<WorkspaceBrand>().notNull().default({}),
  /** ST01 "Email gửi báo cáo" (domain cần xác minh SPF/DKIM ở nhà cung cấp email, B4). */
  reportFromEmail: text('report_from_email'),
  badgeRemoved: boolean('badge_removed').notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const ROLES = ['owner', 'manager', 'buyer'] as const;
export type Role = (typeof ROLES)[number];

export const memberships = app.table(
  'memberships',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ROLES }).notNull(),
    /** Rỗng = mọi Client (owner/manager). */
    clientAccess: uuid('client_access')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    /** P2a: Owner cấp quyền duyệt hành động cho buyer theo Client (Gate 1). */
    approveClientIds: uuid('approve_client_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] }), index().on(t.userId)],
);

export const clients = app.table(
  'clients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    brandOverride: jsonb('brand_override').$type<WorkspaceBrand>(),
    /** Client mẫu do S01 tạo (xóa cùng dữ liệu mẫu). */
    isDemo: boolean('is_demo').notNull().default(false),
    reportLocale: text('report_locale'),
    archivedAt: tsz('archived_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.workspaceId)],
);

export const invitations = app.table(
  'invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: text('role', { enum: ROLES }).notNull(),
    clientAccess: uuid('client_access')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    /** SHA-256 của token; token gốc chỉ nằm trong email mời. */
    tokenHash: text('token_hash').notNull(),
    invitedBy: uuid('invited_by').notNull(),
    expiresAt: tsz('expires_at').notNull(),
    acceptedAt: tsz('accepted_at'),
    revokedAt: tsz('revoked_at'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex().on(t.tokenHash), index().on(t.workspaceId)],
);

/** Đội AdxLens (L3 18.2). Không có workspace_id; chỉ service role đọc. */
export const staff = app.table('staff', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  canEnableFlags: boolean('can_enable_flags').notNull().default(false),
  createdAt: createdAt(),
});

/**
 * Đếm đăng nhập sai theo SHA-256 của email (không lưu email). Không có workspace_id; chỉ service
 * role đọc. Penpot A03 · lỗi: khóa 15 phút sau 5 lần sai.
 */
export const authThrottle = app.table('auth_throttle', {
  keyHash: text('key_hash').primaryKey(),
  failures: integer('failures').notNull().default(0),
  lockedUntil: tsz('locked_until'),
  updatedAt: updatedAt(),
});

/** Nhật ký thao tác nhạy cảm trong workspace (chuyển quyền owner, đổi vai trò). Chỉ thêm. */
export const auditEvents = app.table(
  'audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    actorUserId: uuid('actor_user_id'),
    event: text('event').notNull(),
    detail: jsonb('detail').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.workspaceId, t.createdAt)],
);
