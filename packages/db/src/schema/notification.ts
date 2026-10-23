import { boolean, index, jsonb, primaryKey, text, unique, uuid } from 'drizzle-orm/pg-core';
import { app, createdAt, tsz, updatedAt } from './_common';

export const EMAIL_STATUSES = ['none', 'queued', 'sent', 'failed'] as const;

/**
 * Thông báo trong app (PRD P0-25, X05): một dòng cho mỗi người nhận; nội dung là khóa i18n + tham số (cùng
 * nội dung với email). `dedupe_key` chống gửi trùng cùng sự kiện cho cùng người.
 */
export const notifications = app.table(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    userId: uuid('user_id').notNull(),
    kind: text('kind').notNull(),
    params: jsonb('params').$type<Record<string, string | number>>().notNull().default({}),
    link: text('link'),
    dedupeKey: text('dedupe_key'),
    readAt: tsz('read_at'),
    emailStatus: text('email_status', { enum: EMAIL_STATUSES }).notNull().default('none'),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.workspaceId, t.userId, t.createdAt), unique().on(t.workspaceId, t.userId, t.dedupeKey)],
);

/** ST05: người dùng chọn nhận gì (trong app / email) theo loại; loại bắt buộc luôn bật (ghi ở code). */
export const notificationSettings = app.table(
  'notification_settings',
  {
    workspaceId: uuid('workspace_id').notNull(),
    userId: uuid('user_id').notNull(),
    kind: text('kind').notNull(),
    inApp: boolean('in_app').notNull(),
    email: boolean('email').notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId, t.kind] })],
);
