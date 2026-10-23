import { integer, numeric, text, uuid } from 'drizzle-orm/pg-core';
import { app, tsz, updatedAt } from './_common';
import { workspaces } from './tenancy';

/**
 * Guardrails của workspace (P205, ADR-0001 A7, ADR-0008). Không có dòng = mặc định trong code (khóa bằng
 * test). Giá trị ở đây chỉ được **chặt hơn** mặc định — `core/execution` từ chối lưu giá trị nới lỏng.
 */
export const guardrailSettings = app.table('guardrail_settings', {
  workspaceId: uuid('workspace_id')
    .primaryKey()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  maxBudgetChangePct: numeric('max_budget_change_pct', { precision: 5, scale: 2 }).notNull(),
  maxActionsPerDay: integer('max_actions_per_day').notNull(),
  minDataDays: integer('min_data_days').notNull(),
  quietStartHour: integer('quiet_start_hour').notNull(),
  quietEndHour: integer('quiet_end_hour').notNull(),
  breakerFailures: integer('breaker_failures').notNull(),
  /** Đối tượng Meta (campaign / ad set / ad) không bao giờ được thao tác. */
  excludeMetaIds: text('exclude_meta_ids').array().notNull(),
  updatedBy: uuid('updated_by'),
  updatedAt: updatedAt(),
  createdAt: tsz('created_at').notNull().defaultNow(),
});
