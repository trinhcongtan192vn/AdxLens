import { boolean, index, integer, jsonb, text, uuid } from 'drizzle-orm/pg-core';
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

/**
 * Kết quả `pnpm execution:check` (test tích hợp lớp ghi trên tài khoản Meta test, ADR-0008 mục 9). Checklist
 * cờ `p2a_approve` đòi lần chạy gần nhất của bản deploy hiện tại (`APP_VERSION`) đạt. Dữ liệu vận hành,
 * không thuộc workspace.
 */
export const opsExecutionChecks = app.table(
  'ops_execution_checks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appVersion: text('app_version').notNull(),
    appEnv: text('app_env').notNull(),
    passed: boolean('passed').notNull(),
    steps: jsonb('steps').$type<{ action: string; ok: boolean }[]>().notNull(),
    ranAt: tsz('ran_at').notNull().defaultNow(),
  },
  (t) => [index().on(t.appVersion, t.ranAt)],
);

/**
 * Nhật ký thao tác trang admin (ADR-0013): ai, khi nào, làm gì, với đối tượng nào, lý do. Chỉ thêm (trigger chặn
 * UPDATE / DELETE). Không ghi token, body request hay số liệu quảng cáo.
 */
export const adminAuditLog = app.table(
  'admin_audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorUserId: uuid('actor_user_id').notNull(),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id'),
    workspaceId: uuid('workspace_id'),
    reason: text('reason'),
    detail: jsonb('detail').$type<Record<string, unknown>>().notNull().default({}),
    at: tsz('at').notNull().defaultNow(),
  },
  (t) => [index().on(t.at), index().on(t.actorUserId, t.at), index().on(t.workspaceId)],
);

/**
 * Cấu hình vận hành toàn hệ thống chỉnh từ trang admin (ADR-0013): email nhận cảnh báo đội, thông báo bảo trì.
 * Không chứa secret (Slack webhook vẫn ở biến môi trường). RLS bật, không policy cho người dùng.
 */
export const systemSettings = app.table('system_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').$type<Record<string, unknown>>().notNull(),
  updatedBy: uuid('updated_by'),
  updatedAt: tsz('updated_at').notNull().defaultNow(),
});
