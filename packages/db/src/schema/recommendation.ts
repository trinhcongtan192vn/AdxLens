import { date, index, integer, jsonb, numeric, text, unique, uuid } from 'drizzle-orm/pg-core';
import { app, createdAt, money, tsz, updatedAt } from './_common';
import { adAccounts } from './connections';
import { findings, type I18nText } from './insight';

export const RECOMMENDATION_SOURCES = ['finding', 'creative'] as const;
export const RECOMMENDATION_STATUSES = ['proposed', 'in_progress', 'done', 'skipped'] as const;
export const SKIP_REASONS = ['not_relevant', 'wrong', 'later', 'other'] as const;

/**
 * Weekly Action List (P1-04, P1-05): một dòng cho mỗi (tuần, nguồn, khóa nguồn, đối tượng). `week` là thứ
 * Hai theo múi giờ workspace. Điểm ưu tiên = tác động tương đối × độ tin cậy ÷ công sức (giờ), giảm theo
 * tỷ lệ "sai" của loại gợi ý (PRD 10.3). Tác động tiền theo tiền tệ tài khoản (`numeric`).
 */
export const recommendations = app.table(
  'recommendations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    adAccountId: uuid('ad_account_id')
      .notNull()
      .references(() => adAccounts.id, { onDelete: 'cascade' }),
    week: date('week', { mode: 'string' }).notNull(),
    source: text('source', { enum: RECOMMENDATION_SOURCES }).notNull(),
    /** `rule_id` của phát hiện, hoặc `creative_<nhãn>`. */
    sourceKey: text('source_key').notNull(),
    findingId: uuid('finding_id').references(() => findings.id, { onDelete: 'set null' }),
    entityType: text('entity_type').notNull(),
    metaId: text('meta_id').notNull(),
    entityName: text('entity_name'),
    action: jsonb('action').$type<I18nText>().notNull(),
    why: jsonb('why').$type<I18nText>().notNull(),
    evidence: jsonb('evidence').$type<Record<string, unknown>>().notNull(),
    impactEstimate: money('impact_estimate'),
    confidence: numeric('confidence', { precision: 4, scale: 3 }).notNull(),
    effortMinutes: integer('effort_minutes').notNull(),
    score: numeric('score', { precision: 14, scale: 6 }).notNull(),
    status: text('status', { enum: RECOMMENDATION_STATUSES }).notNull().default('proposed'),
    skipReason: text('skip_reason', { enum: SKIP_REASONS }),
    assigneeId: uuid('assignee_id'),
    statusChangedBy: uuid('status_changed_by'),
    statusChangedAt: tsz('status_changed_at'),
    doneAt: tsz('done_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique().on(t.workspaceId, t.week, t.adAccountId, t.source, t.sourceKey, t.metaId),
    index().on(t.workspaceId, t.week),
    index().on(t.workspaceId, t.assigneeId),
  ],
);
