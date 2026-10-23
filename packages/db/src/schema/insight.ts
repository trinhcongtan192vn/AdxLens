import { bigserial, boolean, index, jsonb, text, unique, uuid } from 'drizzle-orm/pg-core';
import { app, createdAt, money, tsz, updatedAt } from './_common';
import { adAccounts } from './connections';

export const SEVERITIES = ['low', 'medium', 'high'] as const;
export const FINDING_STATUSES = ['new', 'seen', 'done', 'dismissed', 'resolved'] as const;
export const FEEDBACK_KINDS = ['seen', 'done', 'dismissed', 'wrong'] as const;

export type I18nText = { key: string; params?: Record<string, string | number> };

/** Phát hiện audit (L3 5.2, ADR-0006): một dòng cho mỗi (tài khoản, quy tắc, đối tượng). */
export const findings = app.table(
  'findings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    adAccountId: uuid('ad_account_id')
      .notNull()
      .references(() => adAccounts.id, { onDelete: 'cascade' }),
    ruleId: text('rule_id').notNull(),
    ruleGroup: text('rule_group').notNull(),
    entityType: text('entity_type').notNull(),
    metaId: text('meta_id').notNull(),
    entityName: text('entity_name'),
    severity: text('severity', { enum: SEVERITIES }).notNull(),
    impactEstimate: money('impact_estimate'),
    impactMethod: text('impact_method'),
    evidence: jsonb('evidence').$type<Record<string, unknown>>().notNull(),
    explanation: jsonb('explanation').$type<{ why: I18nText; whatToDo: I18nText; deepLink: string | null }>().notNull(),
    status: text('status', { enum: FINDING_STATUSES }).notNull().default('new'),
    dismissReason: text('dismiss_reason'),
    snapshotVersion: text('snapshot_version').notNull(),
    firstSeenAt: tsz('first_seen_at').notNull().defaultNow(),
    lastSeenAt: tsz('last_seen_at').notNull().defaultNow(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique().on(t.adAccountId, t.ruleId, t.entityType, t.metaId),
    index().on(t.workspaceId),
    index().on(t.adAccountId, t.status),
  ],
);

/** Phản hồi trên phát hiện (L2 5.4): tổng hợp tỷ lệ "sai" theo quy tắc. */
export const findingFeedback = app.table(
  'finding_feedback',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    findingId: uuid('finding_id')
      .notNull()
      .references(() => findings.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    kind: text('kind', { enum: FEEDBACK_KINDS }).notNull(),
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.workspaceId), index().on(t.findingId)],
);

/**
 * Cấu hình quy tắc (L3 8): ngưỡng theo `rule_id`; `workspace_id` null = mặc định toàn hệ thống, có giá
 * trị = ghi đè cho workspace. Không có dòng → dùng mặc định trong code.
 */
export const ruleConfigs = app.table(
  'rule_configs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id'),
    ruleId: text('rule_id').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    config: jsonb('config').$type<Record<string, number>>().notNull().default({}),
    updatedAt: updatedAt(),
  },
  (t) => [unique().on(t.ruleId, t.workspaceId).nullsNotDistinct()],
);
