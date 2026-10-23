import { index, text, uuid } from 'drizzle-orm/pg-core';
import { app, createdAt, tsz } from './_common';

export const DELETION_SOURCES = ['user', 'meta_callback'] as const;
export const DELETION_STATUSES = ['pending', 'in_progress', 'done', 'cancelled'] as const;

/**
 * Yêu cầu xóa dữ liệu (PRD P0-22, L3 5.5, ADR-0001 A8): token xóa ngay khi ngắt kết nối; dữ liệu quảng
 * cáo xóa sau `purge_after` (7 ngày, trong cam kết 30 ngày). `code` là mã xác nhận tra cứu công khai
 * (trang hướng dẫn xóa dữ liệu, phản hồi data deletion callback của Meta).
 */
export const deletionRequests = app.table(
  'deletion_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    connectionId: uuid('connection_id').notNull(),
    /** Một yêu cầu từ Meta có thể gồm nhiều kết nối dùng chung một mã. */
    code: text('code').notNull(),
    source: text('source', { enum: DELETION_SOURCES }).notNull(),
    metaUserId: text('meta_user_id').notNull(),
    requestedBy: uuid('requested_by'),
    status: text('status', { enum: DELETION_STATUSES }).notNull().default('pending'),
    purgeAfter: tsz('purge_after').notNull(),
    completedAt: tsz('completed_at'),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.workspaceId), index().on(t.connectionId), index().on(t.code)],
);
