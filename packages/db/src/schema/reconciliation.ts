import { bigint, date, index, jsonb, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { app, money, ratio, tsz } from './_common';
import { adAccounts } from './connections';

export const RECONCILIATION_STATUSES = ['ok', 'warning'] as const;

/**
 * Kết quả đối chiếu theo ngày (L3 5.2, 6.4): số AdxLens (cộng từ insights_daily) so với insight cấp
 * tài khoản của Meta. `status` chỉ xét chi tiêu và kết quả; các chỉ số còn lại để hiển thị D04.
 */
export const reconciliationResults = app.table(
  'reconciliation_results',
  {
    workspaceId: uuid('workspace_id').notNull(),
    adAccountId: uuid('ad_account_id')
      .notNull()
      .references(() => adAccounts.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    spendInternal: money('spend_internal').notNull(),
    spendMeta: money('spend_meta').notNull(),
    resultsInternal: bigint('results_internal', { mode: 'number' }).notNull(),
    resultsMeta: bigint('results_meta', { mode: 'number' }).notNull(),
    impressionsInternal: bigint('impressions_internal', { mode: 'number' }).notNull().default(0),
    impressionsMeta: bigint('impressions_meta', { mode: 'number' }).notNull().default(0),
    linkClicksInternal: bigint('link_clicks_internal', { mode: 'number' }).notNull().default(0),
    linkClicksMeta: bigint('link_clicks_meta', { mode: 'number' }).notNull().default(0),
    conversionValueInternal: money('conversion_value_internal').notNull().default('0'),
    conversionValueMeta: money('conversion_value_meta').notNull().default('0'),
    /** action_type được tính là "kết quả" trong ngày (theo mục tiêu tối ưu). */
    resultTypes: text('result_types').array().notNull().default([]),
    /** Kết quả theo từng action_type: { type: { internal, meta, delta_pct } } (D04 hiển thị từng dòng). */
    resultsByType: jsonb('results_by_type')
      .$type<Record<string, { internal: number; meta: number; delta_pct: string }>>()
      .notNull()
      .default({}),
    spendDeltaPct: ratio('spend_delta_pct').notNull(),
    resultsDeltaPct: ratio('results_delta_pct').notNull(),
    status: text('status', { enum: RECONCILIATION_STATUSES }).notNull(),
    checkedAt: tsz('checked_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.adAccountId, t.date] }),
    index().on(t.workspaceId),
    index().on(t.adAccountId, t.status),
  ],
);
