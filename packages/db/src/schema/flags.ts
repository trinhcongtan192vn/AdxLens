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
