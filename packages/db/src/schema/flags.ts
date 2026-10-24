import { bigserial, boolean, index, jsonb, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { app, tsz } from './_common';
import { workspaces } from './tenancy';

export const FLAG_KEYS = ['p0_reports', 'p1_recommendations', 'p2a_approve', 'p2b_auto'] as const;
export type FlagKey = (typeof FLAG_KEYS)[number];

/** L3 18.1. Mặc định tắt; chỉ đổi qua packages/core/flags. */
export const featureFlags = app.table(
  'feature_flags',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    flagKey: text('flag_key', { enum: FLAG_KEYS }).notNull(),
    enabled: boolean('enabled').notNull().default(false),
    enabledBy: uuid('enabled_by'),
    enabledAt: tsz('enabled_at'),
    reason: text('reason'),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.flagKey] })],
);

export const FLAG_PROPOSAL_STATUSES = ['pending', 'approved', 'rejected', 'canceled'] as const;

/** Đề xuất bật cờ của operator, superadmin duyệt (ADR-0013). Duyệt vẫn bật qua core/flags. */
export const flagProposals = app.table(
  'flag_proposals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    flagKey: text('flag_key', { enum: FLAG_KEYS }).notNull(),
    proposedBy: uuid('proposed_by').notNull(),
    reason: text('reason').notNull(),
    status: text('status', { enum: FLAG_PROPOSAL_STATUSES }).notNull().default('pending'),
    decidedBy: uuid('decided_by'),
    decidedAt: tsz('decided_at'),
    decisionNote: text('decision_note'),
    createdAt: tsz('created_at').notNull().defaultNow(),
  },
  (t) => [index().on(t.status, t.createdAt), index().on(t.workspaceId)],
);

export type ChecklistItemResult = { id: string; label: string; passed: boolean; detail?: string };

/** Chỉ thêm (append-only). */
export const flagChangeLog = app.table(
  'flag_change_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    flagKey: text('flag_key', { enum: FLAG_KEYS }).notNull(),
    oldValue: boolean('old_value').notNull(),
    newValue: boolean('new_value').notNull(),
    changedBy: uuid('changed_by').notNull(),
    reason: text('reason').notNull(),
    checklistResult: jsonb('checklist_result').$type<ChecklistItemResult[]>().notNull(),
    override: boolean('override').notNull().default(false),
    at: tsz('at').notNull().defaultNow(),
  },
  (t) => [index().on(t.workspaceId, t.flagKey)],
);
