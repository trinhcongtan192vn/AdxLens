import { boolean, customType, index, integer, jsonb, text, unique, uuid } from 'drizzle-orm/pg-core';
import { app, createdAt, money, tsz, updatedAt } from './_common';
import { clients, workspaces } from './tenancy';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

export const CONNECTION_STATUSES = ['active', 'expired', 'revoked'] as const;

/**
 * Kết nối Meta (L3 5.2). Token mã hóa AES-256-GCM (L3 5.4); không có policy SELECT cho người dùng
 * (L3 5.3), chỉ service role đọc. Không bao giờ trả token qua API (CLAUDE.md quy tắc 2).
 */
export const metaConnections = app.table(
  'meta_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by').notNull(),
    metaUserId: text('meta_user_id').notNull(),
    metaUserName: text('meta_user_name'),
    tokenCiphertext: bytea('token_ciphertext').notNull(),
    tokenKeyVersion: integer('token_key_version').notNull(),
    scopes: text('scopes').array().notNull(),
    expiresAt: tsz('expires_at'),
    status: text('status', { enum: CONNECTION_STATUSES }).notNull().default('active'),
    lastRefreshedAt: tsz('last_refreshed_at'),
    /** Tài khoản mẫu (PRD P0-02, S01): dữ liệu giả từ mock, ghi rõ là mẫu, không tính phí, không chia sẻ được. */
    isDemo: boolean('is_demo').notNull().default(false),
    /**
     * P2-01: Owner bật quyền ghi cho kết nối (sau OAuth có `ads_management`) và thu hồi được bất cứ lúc nào.
     * Ghi chỉ được khi cả scope có `ads_management` và cờ này bật (ADR-0008).
     */
    writeEnabled: boolean('write_enabled').notNull().default(false),
    writeChangedAt: tsz('write_changed_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.workspaceId), index().on(t.metaUserId)],
);

/** Danh sách tài khoản QC mà kết nối truy cập được (S04 chọn từ đây), làm mới khi đồng bộ. */
export const metaAvailableAccounts = app.table(
  'meta_available_accounts',
  {
    workspaceId: uuid('workspace_id').notNull(),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => metaConnections.id, { onDelete: 'cascade' }),
    metaAccountId: text('meta_account_id').notNull(),
    name: text('name').notNull(),
    currency: text('currency').notNull(),
    timezone: text('timezone').notNull(),
    accountStatus: integer('account_status'),
    /** Chi tiêu 30 ngày (S04), worker tính sau OAuth bằng token đã giải mã. Null = đang lấy. */
    spend30d: money('spend_30d'),
    spendCheckedAt: tsz('spend_checked_at'),
    seenAt: tsz('seen_at').notNull().defaultNow(),
  },
  (t) => [unique().on(t.connectionId, t.metaAccountId), index().on(t.workspaceId)],
);

export const ASSIGNMENT_STATUSES = ['suggested', 'confirmed'] as const;
export const SYNC_STATUSES = ['pending', 'syncing', 'ok', 'error', 'no_access'] as const;

/** Tài khoản QC đã nhập (L3 5.2). Gán Client phải được xác nhận trước khi báo cáo được chia sẻ. */
export const adAccounts = app.table(
  'ad_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => metaConnections.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').references(() => clients.id, { onDelete: 'set null' }),
    /** Tên Client gợi ý khi chưa có Client phù hợp (S05). */
    suggestedClientName: text('suggested_client_name'),
    metaAccountId: text('meta_account_id').notNull(),
    name: text('name').notNull(),
    currency: text('currency').notNull(),
    timezone: text('timezone').notNull(),
    assignmentStatus: text('assignment_status', { enum: ASSIGNMENT_STATUSES }).notNull().default('suggested'),
    syncStatus: text('sync_status', { enum: SYNC_STATUSES }).notNull().default('pending'),
    lastSyncedAt: tsz('last_synced_at'),
    active30d: boolean('active_30d').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique().on(t.workspaceId, t.metaAccountId), index().on(t.workspaceId, t.clientId)],
);

/** Nhật ký lời gọi Meta (L3 6.2): endpoint, tài khoản, thời lượng, mã lỗi. Không chứa token. */
export const jobAudit = app.table(
  'job_audit',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id'),
    jobId: text('job_id'),
    endpoint: text('endpoint').notNull(),
    metaAccountId: text('meta_account_id'),
    durationMs: integer('duration_ms').notNull(),
    status: integer('status').notNull(),
    errorCode: integer('error_code'),
    attempt: integer('attempt').notNull().default(1),
    at: tsz('at').notNull().defaultNow(),
  },
  (t) => [index().on(t.at), index().on(t.workspaceId, t.at)],
);

export const META_ASSET_KINDS = ['page', 'instagram', 'pixel', 'catalog'] as const;
export type MetaAssetKind = (typeof META_ASSET_KINDS)[number];

/**
 * Tài sản Meta của kết nối (ADR-0016): chỉ danh sách id / tên để chọn mặc định theo Client (ADR-0017). Không lưu
 * page token, không lưu nội dung Page / lead. `parentId`: Page của Instagram, ad account của Pixel, Business của
 * catalog.
 */
export const metaAssets = app.table(
  'meta_assets',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => metaConnections.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: META_ASSET_KINDS }).notNull(),
    metaId: text('meta_id').notNull(),
    name: text('name').notNull(),
    parentId: text('parent_id'),
    attrs: jsonb('attrs').$type<Record<string, string | null>>().notNull().default({}),
    seenAt: tsz('seen_at').notNull().defaultNow(),
  },
  (t) => [unique().on(t.connectionId, t.kind, t.metaId), index().on(t.workspaceId, t.kind)],
);
