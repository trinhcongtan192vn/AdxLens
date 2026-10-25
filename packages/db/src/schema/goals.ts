import { boolean, date, index, numeric, text, unique, uuid } from 'drizzle-orm/pg-core';
import { app, createdAt, tsz, updatedAt } from './_common';
import { adAccounts } from './connections';
import { clients, workspaces } from './tenancy';

/**
 * Mục tiêu KPI, chỉ số phụ, ngành và tài sản mặc định theo Client (ADR-0017). Một dòng mỗi Client. `metric` là khóa
 * trong danh mục chỉ số của core (`GOAL_METRICS`); `target` theo tiền tệ `currency` (chỉ số tiền) hoặc % / lần.
 */
export const clientGoals = app.table(
  'client_goals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    primaryMetric: text('primary_metric'),
    primaryTarget: numeric('primary_target', { precision: 18, scale: 4 }),
    currency: text('currency'),
    secondaryMetrics: text('secondary_metrics').array().notNull().default([]),
    industry: text('industry'),
    subIndustry: text('sub_industry'),
    defaultPageId: text('default_page_id'),
    defaultInstagramId: text('default_instagram_id'),
    defaultPixelId: text('default_pixel_id'),
    onboardedAt: tsz('onboarded_at'),
    updatedBy: uuid('updated_by'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique().on(t.workspaceId, t.clientId), index().on(t.workspaceId)],
);

export const ALERT_CONDITIONS = ['above', 'below'] as const;
export const ALERT_WINDOWS = ['1d', '7d'] as const;

/**
 * Cảnh báo người dùng tự đặt (ADR-0018). `adAccountId` null = mọi tài khoản cùng tiền tệ `currency` của workspace.
 * Worker đánh giá sau audit hằng ngày; bắn tối đa 1 lần / ngày (`lastFiredOn` theo ngày dữ liệu).
 */
export const customAlerts = app.table(
  'custom_alerts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    adAccountId: uuid('ad_account_id').references(() => adAccounts.id, { onDelete: 'cascade' }),
    currency: text('currency'),
    metric: text('metric').notNull(),
    condition: text('condition', { enum: ALERT_CONDITIONS }).notNull(),
    threshold: numeric('threshold', { precision: 18, scale: 4 }).notNull(),
    window: text('window', { enum: ALERT_WINDOWS }).notNull().default('1d'),
    enabled: boolean('enabled').notNull().default(true),
    createdBy: uuid('created_by').notNull(),
    lastFiredOn: date('last_fired_on', { mode: 'string' }),
    lastValue: numeric('last_value', { precision: 18, scale: 4 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.workspaceId), index().on(t.workspaceId, t.adAccountId)],
);
