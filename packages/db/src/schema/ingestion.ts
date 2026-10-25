import { bigint, date, index, integer, jsonb, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { analytics, app, createdAt, money, ratio, tsz, updatedAt } from './_common';
import { adAccounts } from './connections';

export const ENTITY_TYPES = ['campaign', 'adset', 'ad', 'creative'] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

/** Cấu trúc tài khoản (L3 5.2): campaign / ad set / ad / creative, cập nhật mỗi lần đồng bộ. */
export const entities = analytics.table(
  'entities',
  {
    workspaceId: uuid('workspace_id').notNull(),
    adAccountId: uuid('ad_account_id')
      .notNull()
      .references(() => adAccounts.id, { onDelete: 'cascade' }),
    entityType: text('entity_type', { enum: ENTITY_TYPES }).notNull(),
    metaId: text('meta_id').notNull(),
    parentMetaId: text('parent_meta_id'),
    name: text('name'),
    status: text('status'),
    objective: text('objective'),
    dailyBudget: money('daily_budget'),
    learningStage: text('learning_stage'),
    attrs: jsonb('attrs').$type<Record<string, unknown>>().notNull().default({}),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.adAccountId, t.entityType, t.metaId] }), index().on(t.workspaceId)],
);

/**
 * Snapshot insight theo ngày (L3 5.2). `date` theo múi giờ của ad account; tiền numeric(18,4)
 * (CLAUDE.md quy tắc 4). Lưu ở cấp ad; cấp cao hơn cộng từ đây.
 */
export const insightsDaily = analytics.table(
  'insights_daily',
  {
    workspaceId: uuid('workspace_id').notNull(),
    adAccountId: uuid('ad_account_id')
      .notNull()
      .references(() => adAccounts.id, { onDelete: 'cascade' }),
    entityType: text('entity_type', { enum: ENTITY_TYPES }).notNull(),
    metaId: text('meta_id').notNull(),
    campaignId: text('campaign_id'),
    adsetId: text('adset_id'),
    date: date('date', { mode: 'string' }).notNull(),
    spend: money('spend').notNull().default('0'),
    impressions: bigint('impressions', { mode: 'number' }).notNull().default(0),
    reach: bigint('reach', { mode: 'number' }).notNull().default(0),
    frequency: ratio('frequency'),
    clicks: bigint('clicks', { mode: 'number' }).notNull().default(0),
    linkClicks: bigint('link_clicks', { mode: 'number' }).notNull().default(0),
    /** Kết quả theo mục tiêu tối ưu của ad set; `resultType` là action_type tương ứng. */
    results: bigint('results', { mode: 'number' }).notNull().default(0),
    resultType: text('result_type'),
    conversionValue: money('conversion_value'),
    attributionWindow: text('attribution_window').notNull(),
    actions: jsonb('actions').$type<{ action_type: string; value: string }[]>(),
    fetchedAt: tsz('fetched_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.adAccountId, t.entityType, t.metaId, t.date] }),
    index().on(t.adAccountId, t.date),
    index().on(t.workspaceId),
  ],
);

export const SYNC_KINDS = ['backfill', 'daily', 'manual'] as const;
export const SYNC_RUN_STATUSES = ['queued', 'running', 'succeeded', 'failed'] as const;

/** Một lần đồng bộ (L3 5.2, 6.3); backfill chia lô 7 ngày, mỗi lô một job, tiến độ theo lô. */
export const syncRuns = app.table(
  'sync_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    adAccountId: uuid('ad_account_id')
      .notNull()
      .references(() => adAccounts.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: SYNC_KINDS }).notNull(),
    dateFrom: date('date_from', { mode: 'string' }).notNull(),
    dateTo: date('date_to', { mode: 'string' }).notNull(),
    status: text('status', { enum: SYNC_RUN_STATUSES }).notNull().default('queued'),
    batchesTotal: integer('batches_total').notNull().default(1),
    batchesDone: integer('batches_done').notNull().default(0),
    daysDone: integer('days_done').notNull().default(0),
    daysTotal: integer('days_total').notNull().default(0),
    rowsWritten: integer('rows_written').notNull().default(0),
    /** Mã lỗi ngắn (không chứa token hay thông điệp thô của Meta). */
    error: text('error'),
    startedAt: tsz('started_at'),
    finishedAt: tsz('finished_at'),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.workspaceId), index().on(t.adAccountId, t.createdAt)],
);

export const BREAKDOWN_KEYS = ['age_gender', 'placement', 'region', 'country'] as const;

/**
 * Insight theo nhóm (roadmap A4): theo ngày, cấp ad set, tách theo độ tuổi-giới tính / vị trí hiển thị / khu vực.
 * `key` = giá trị nhóm ("25-34|female", "instagram|story", "Hanoi"). Kết quả tính theo mục tiêu của ad set như
 * `insights_daily`. Tổng theo nhóm có thể lệch nhẹ tổng tài khoản (Meta ẩn / làm tròn nhóm nhỏ).
 */
export const insightsBreakdowns = analytics.table(
  'insights_breakdowns',
  {
    workspaceId: uuid('workspace_id').notNull(),
    adAccountId: uuid('ad_account_id')
      .notNull()
      .references(() => adAccounts.id, { onDelete: 'cascade' }),
    adsetId: text('adset_id').notNull(),
    date: date('date', { mode: 'string' }).notNull(),
    breakdown: text('breakdown', { enum: BREAKDOWN_KEYS }).notNull(),
    key: text('key').notNull(),
    spend: money('spend').notNull().default('0'),
    impressions: bigint('impressions', { mode: 'number' }).notNull().default(0),
    linkClicks: bigint('link_clicks', { mode: 'number' }).notNull().default(0),
    results: bigint('results', { mode: 'number' }).notNull().default(0),
    fetchedAt: tsz('fetched_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.adAccountId, t.adsetId, t.date, t.breakdown, t.key] }),
    index().on(t.adAccountId, t.breakdown, t.date),
    index().on(t.workspaceId),
  ],
);
