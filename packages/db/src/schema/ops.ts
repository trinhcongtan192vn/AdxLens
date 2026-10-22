import { index, integer, jsonb, text, uuid } from 'drizzle-orm/pg-core';
import { app, createdAt, tsz, updatedAt } from './_common';

export const INCIDENT_SEVERITIES = ['P1', 'P2', 'P3'] as const;
export const INCIDENT_STATUSES = ['open', 'mitigated', 'resolved'] as const;

/**
 * Sự cố vận hành (L2 3.1 OpsIncident). workspace_id có thể null với sự cố toàn hệ thống; chỉ module
 * ops truy vấn xuyên workspace (CLAUDE.md quy tắc 1).
 */
export const opsIncidents = app.table(
  'ops_incidents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id'),
    adAccountId: uuid('ad_account_id'),
    kind: text('kind').notNull(),
    severity: text('severity', { enum: INCIDENT_SEVERITIES }).notNull(),
    source: text('source').notNull(),
    /** Gom sự cố trùng: cùng fingerprint khi đang mở thì tăng occurrences. */
    fingerprint: text('fingerprint').notNull(),
    title: text('title').notNull(),
    detail: jsonb('detail').$type<Record<string, unknown>>().notNull().default({}),
    status: text('status', { enum: INCIDENT_STATUSES }).notNull().default('open'),
    occurrences: integer('occurrences').notNull().default(1),
    issueRef: text('issue_ref'),
    resolvedAt: tsz('resolved_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.status, t.severity), index().on(t.fingerprint), index().on(t.workspaceId)],
);

export const opsPlaybookRuns = app.table(
  'ops_playbook_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    incidentId: uuid('incident_id').references(() => opsIncidents.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id'),
    playbook: text('playbook').notNull(),
    /** Khóa giới hạn số lần (ví dụ account id) để áp "1 lần/ngày/account". */
    scopeKey: text('scope_key').notNull(),
    result: text('result', { enum: ['done', 'skipped', 'failed', 'escalated'] }).notNull(),
    detail: jsonb('detail').$type<Record<string, unknown>>().notNull().default({}),
    at: tsz('at').notNull().defaultNow(),
  },
  (t) => [index().on(t.playbook, t.scopeKey, t.at)],
);
