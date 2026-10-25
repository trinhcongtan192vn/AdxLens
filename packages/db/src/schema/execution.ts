import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  text,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { app, createdAt, tsz, updatedAt } from './_common';
import { adAccounts } from './connections';
import { recommendations } from './recommendation';
import { workspaces } from './tenancy';

/**
 * Guardrails của workspace (P205, ADR-0001 A7, ADR-0008). Không có dòng = mặc định trong code (khóa bằng
 * test). Giá trị ở đây chỉ được **chặt hơn** mặc định — `core/execution` từ chối lưu giá trị nới lỏng.
 */
export const guardrailSettings = app.table('guardrail_settings', {
  workspaceId: uuid('workspace_id')
    .primaryKey()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  maxBudgetChangePct: numeric('max_budget_change_pct', { precision: 5, scale: 2 }).notNull(),
  maxActionsPerDay: integer('max_actions_per_day').notNull(),
  minDataDays: integer('min_data_days').notNull(),
  quietStartHour: integer('quiet_start_hour').notNull(),
  quietEndHour: integer('quiet_end_hour').notNull(),
  breakerFailures: integer('breaker_failures').notNull(),
  /** Đối tượng Meta (campaign / ad set / ad) không bao giờ được thao tác. */
  excludeMetaIds: text('exclude_meta_ids').array().notNull(),
  updatedBy: uuid('updated_by'),
  updatedAt: updatedAt(),
  createdAt: tsz('created_at').notNull().defaultNow(),
});

export const ACTION_STATUSES = ['pending', 'executing', 'success', 'failed', 'undone', 'canceled'] as const;
export const ACTION_TIERS = ['approve', 'auto'] as const;

/**
 * Hành động ghi lên Meta (L3 5.2, ADR-0008). Chỉ `core/execution` tạo / đổi trạng thái. `idempotency_key`
 * unique chống tạo trùng; `before_state` chụp lúc duyệt, worker so với trạng thái thật trước khi ghi.
 */
export const actions = app.table(
  'actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    adAccountId: uuid('ad_account_id')
      .notNull()
      .references(() => adAccounts.id, { onDelete: 'cascade' }),
    recommendationId: uuid('recommendation_id').references(() => recommendations.id, { onDelete: 'set null' }),
    ruleId: uuid('rule_id'),
    actionType: text('action_type').notNull(),
    /** `account`: hành động cấp tài khoản QC (tạo lookalike, ADR-0023). */
    targetType: text('target_type', { enum: ['ad', 'adset', 'campaign', 'account'] }).notNull(),
    targetMetaId: text('target_meta_id').notNull(),
    targetName: text('target_name'),
    tier: text('tier', { enum: ACTION_TIERS }).notNull(),
    params: jsonb('params').$type<Record<string, string>>().notNull(),
    beforeState: jsonb('before_state').$type<Record<string, string | null>>().notNull(),
    afterExpected: jsonb('after_expected').$type<Record<string, string | null>>().notNull(),
    afterState: jsonb('after_state').$type<Record<string, string | null>>(),
    status: text('status', { enum: ACTION_STATUSES }).notNull().default('pending'),
    resultCode: text('result_code'),
    errorMessage: text('error_message'),
    idempotencyKey: text('idempotency_key').notNull(),
    requestedBy: uuid('requested_by'),
    approvedBy: uuid('approved_by'),
    undoOf: uuid('undo_of').references((): AnyPgColumn => actions.id, { onDelete: 'set null' }),
    executedAt: tsz('executed_at'),
    verifiedAt: tsz('verified_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('actions_idempotency_key_uq').on(t.idempotencyKey),
    index().on(t.workspaceId, t.createdAt),
    index().on(t.adAccountId, t.createdAt),
  ],
);

/** Nhật ký hành động — chỉ thêm (trigger chặn UPDATE). Không chứa token / body request. */
export const actionLogs = app.table(
  'action_logs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    actionId: uuid('action_id')
      .notNull()
      .references(() => actions.id, { onDelete: 'cascade' }),
    event: text('event').notNull(),
    detail: jsonb('detail').$type<Record<string, unknown>>().notNull(),
    at: tsz('at').notNull().defaultNow(),
  },
  (t) => [index().on(t.actionId), index().on(t.workspaceId)],
);

/**
 * Kill switch (ADR-0008 mục 7): `scope_key` = 'global' (toàn hệ thống, staff) hoặc id workspace. Đang bật →
 * gateway chặn mọi hành động mới và hủy hành động đang chờ.
 */
export const killSwitches = app.table('kill_switches', {
  scopeKey: text('scope_key').primaryKey(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
  active: boolean('active').notNull().default(false),
  reason: text('reason'),
  changedBy: uuid('changed_by'),
  changedAt: tsz('changed_at'),
});

/** Circuit breaker theo tài khoản QC: N lỗi liên tiếp → mở, chặn tới khi Owner đóng. */
export const circuitBreakers = app.table('circuit_breakers', {
  adAccountId: uuid('ad_account_id')
    .primaryKey()
    .references(() => adAccounts.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull(),
  consecutiveFailures: integer('consecutive_failures').notNull().default(0),
  open: boolean('open').notNull().default(false),
  openedAt: tsz('opened_at'),
  closedBy: uuid('closed_by'),
  closedAt: tsz('closed_at'),
});

export const RULE_MODES = ['shadow', 'live', 'paused'] as const;
export const RULE_MATCHES = ['all', 'any'] as const;

/** Hành động của rule (ADR-0012, 0021): `revert` = hành động hẹn giờ; `floorDailyBudget` = sàn khi giảm dần. */
export type RuleAction = {
  type: string;
  changePct?: string;
  maxDailyBudget?: string;
  floorDailyBudget?: string;
  pauseAtFloor?: boolean;
  revert?: { kind: 'restore_budget' | 'suggest_undo'; hour: number };
};

/** Rule tự động (P2b, ADR-0012, L3 18). Tạo mới luôn ở `shadow`. */
export const automationRules = app.table(
  'automation_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    adAccountId: uuid('ad_account_id')
      .notNull()
      .references(() => adAccounts.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    templateKey: text('template_key'),
    level: text('level', { enum: ['ad', 'adset'] }).notNull(),
    condition: jsonb('condition')
      .$type<{ metric: string; op: string; value: string; relative?: 'account_avg' }[]>()
      .notNull(),
    /** ADR-0014: 'all' = mọi điều kiện (VÀ), 'any' = ít nhất một (HOẶC). */
    match: text('match', { enum: RULE_MATCHES }).notNull().default('all'),
    action: jsonb('action').$type<RuleAction>().notNull(),
    guardrails: jsonb('guardrails')
      .$type<{
        maxActionsPerDay?: number;
        excludeMetaIds?: string[];
        cooldownHours?: number;
        schedule?: { days: number[]; startHour: number; endHour: number };
      }>()
      .notNull(),
    mode: text('mode', { enum: RULE_MODES }).notNull().default('shadow'),
    shadowStartedAt: tsz('shadow_started_at'),
    liveSince: tsz('live_since'),
    createdBy: uuid('created_by').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.workspaceId), index().on(t.mode)],
);

/** Kết quả mỗi lần đánh giá rule (shadow lẫn live, L3 18). */
export const ruleEvaluations = app.table(
  'rule_evaluations',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    ruleId: uuid('rule_id')
      .notNull()
      .references(() => automationRules.id, { onDelete: 'cascade' }),
    mode: text('mode', { enum: RULE_MODES }).notNull(),
    evaluatedAt: tsz('evaluated_at').notNull().defaultNow(),
    asOfDate: text('as_of_date').notNull(),
    matchedEntities: jsonb('matched_entities')
      .$type<{ metaId: string; name: string | null; metrics: Record<string, string | null> }[]>()
      .notNull(),
    wouldDo: jsonb('would_do')
      .$type<{ metaId: string; actionType: string; newDailyBudget?: string | null; blockedBy?: string | null }[]>()
      .notNull(),
    actionIds: uuid('action_ids').array(),
    blockedByGuardrail: text('blocked_by_guardrail'),
  },
  (t) => [index().on(t.ruleId, t.evaluatedAt), index().on(t.workspaceId)],
);

export const REVERT_KINDS = ['restore_budget', 'suggest_undo'] as const;
export const REVERT_STATUSES = ['pending', 'done', 'skipped', 'canceled'] as const;

/**
 * Hành động hẹn giờ của rule (ADR-0021): trả ngân sách (Surf) hoặc đề xuất bật lại (Stop-loss / Revive). Job
 * `maintenance:reverts_tick` xử lý dòng đến hạn qua Execution Gateway; không bao giờ tự bật lại đối tượng.
 */
export const scheduledReverts = app.table(
  'scheduled_reverts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    ruleId: uuid('rule_id').references(() => automationRules.id, { onDelete: 'set null' }),
    actionId: uuid('action_id')
      .notNull()
      .references(() => actions.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: REVERT_KINDS }).notNull(),
    dueAt: tsz('due_at').notNull(),
    status: text('status', { enum: REVERT_STATUSES }).notNull().default('pending'),
    result: text('result'),
    resultActionId: uuid('result_action_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.status, t.dueAt), index().on(t.workspaceId), uniqueIndex().on(t.actionId, t.kind)],
);
