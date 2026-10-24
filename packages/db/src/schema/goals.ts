import { index, numeric, text, unique, uuid } from 'drizzle-orm/pg-core';
import { app, createdAt, tsz, updatedAt } from './_common';
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
