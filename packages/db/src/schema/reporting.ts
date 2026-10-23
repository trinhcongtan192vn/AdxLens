import { boolean, date, index, integer, jsonb, smallint, text, unique, uuid } from 'drizzle-orm/pg-core';
import { app, createdAt, money, tsz, updatedAt } from './_common';
import { clients, workspaces } from './tenancy';

export const REPORT_KINDS = ['audit', 'periodic', 'pitch'] as const;
export const REPORT_STATUSES = ['building', 'ready', 'failed'] as const;

/** Trạng thái toàn vẹn lúc dựng (ADR-0007): tài khoản chưa xác nhận gán, ngày lệch > 1% trong kỳ. */
export type ReportIntegrity = {
  unconfirmedAccounts: string[];
  warningDates: { adAccountId: string; dates: string[] }[];
};

/** Phần agency tự viết trên báo cáo (R03). */
export type ReportEdits = { title?: string; workDone?: string; nextSteps?: string; hiddenSections?: string[] };

/** Báo cáo (L3 5.2): nội dung có cấu trúc, mỗi số kèm nguồn; một mẫu cho web công khai và PDF. */
export const reports = app.table(
  'reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: REPORT_KINDS }).notNull(),
    dateFrom: date('date_from', { mode: 'string' }).notNull(),
    dateTo: date('date_to', { mode: 'string' }).notNull(),
    locale: text('locale').notNull(),
    status: text('status', { enum: REPORT_STATUSES }).notNull().default('building'),
    content: jsonb('content').$type<Record<string, unknown>>(),
    edits: jsonb('edits').$type<ReportEdits>().notNull().default({}),
    summaryText: text('summary_text'),
    /** `llm` (đã qua kiểm tra số) hoặc `template` (tóm tắt mẫu không LLM). */
    summarySource: text('summary_source', { enum: ['llm', 'template'] }),
    reconciliationStatus: text('reconciliation_status', { enum: ['ok', 'warning'] }),
    integrity: jsonb('integrity').$type<ReportIntegrity>(),
    templateVersion: text('template_version').notNull(),
    pdfPath: text('pdf_path'),
    error: text('error'),
    createdBy: uuid('created_by').notNull(),
    builtAt: tsz('built_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.workspaceId), index().on(t.clientId, t.createdAt)],
);

/**
 * Link chia sẻ công khai (L3 5.2, PRD P0-14): token 32 byte ngẫu nhiên, thu hồi được, hạn tùy chọn, mật
 * khẩu tùy chọn (scrypt). Trigger DB chặn tạo link khi báo cáo chưa toàn vẹn (ADR-0007, BR01).
 */
export const shareLinks = app.table(
  'share_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    reportId: uuid('report_id')
      .notNull()
      .references(() => reports.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    passwordHash: text('password_hash'),
    showBadge: boolean('show_badge').notNull().default(true),
    expiresAt: tsz('expires_at'),
    revokedAt: tsz('revoked_at'),
    viewCount: integer('view_count').notNull().default(0),
    lastViewedAt: tsz('last_viewed_at'),
    createdBy: uuid('created_by').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.workspaceId), index().on(t.reportId)],
);

export const SCHEDULE_CADENCES = ['weekly', 'monthly'] as const;
export const SCHEDULE_MODES = ['auto', 'approval'] as const;
export const SCHEDULE_DELIVERIES = ['link', 'pdf'] as const;
export const DELIVERY_STATUSES = ['pending_approval', 'approved', 'sent', 'postponed', 'failed'] as const;

/**
 * Lịch gửi báo cáo (PRD P0-17, R05): tuần (thứ) hoặc tháng (ngày), giờ theo múi giờ của lịch; tự động
 * hoặc cần duyệt; gửi link hoặc PDF qua email tới người nhận của khách.
 */
export const reportSchedules = app.table(
  'report_schedules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    cadence: text('cadence', { enum: SCHEDULE_CADENCES }).notNull(),
    /** 1 = thứ Hai … 7 = Chủ nhật (khi weekly). */
    weekday: smallint('weekday'),
    /** 1–28 (khi monthly). */
    monthDay: smallint('month_day'),
    sendHour: smallint('send_hour').notNull(),
    timezone: text('timezone').notNull(),
    mode: text('mode', { enum: SCHEDULE_MODES }).notNull(),
    delivery: text('delivery', { enum: SCHEDULE_DELIVERIES }).notNull(),
    locale: text('locale'),
    recipients: text('recipients').array().notNull(),
    enabled: boolean('enabled').notNull().default(true),
    createdBy: uuid('created_by').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.workspaceId), index().on(t.clientId)],
);

/** Mỗi lần chạy lịch cho một kỳ (`period`: 2026-W43 / 2026-10). Duy nhất theo (lịch, kỳ) — idempotent. */
export const reportDeliveries = app.table(
  'report_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull(),
    scheduleId: uuid('schedule_id')
      .notNull()
      .references(() => reportSchedules.id, { onDelete: 'cascade' }),
    period: text('period').notNull(),
    reportId: uuid('report_id').references(() => reports.id, { onDelete: 'set null' }),
    status: text('status', { enum: DELIVERY_STATUSES }).notNull(),
    /** Mã lý do hoãn/lỗi (unconfirmed, reconciliation, connection_revoked, no_data…). */
    reason: text('reason'),
    sentAt: tsz('sent_at'),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.scheduleId, t.period), index().on(t.workspaceId)],
);

export const PACING_STATUSES = ['on_track', 'over', 'under'] as const;

/**
 * Ngân sách tháng theo Client (roadmap A3): agency nhập ngân sách hợp đồng của tháng (`month` = 'YYYY-MM', tiền
 * numeric theo tiền tệ tài khoản). `alert_status` = trạng thái đã cảnh báo trong tháng (chống gửi lặp).
 */
export const clientBudgets = app.table(
  'client_budgets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    month: text('month').notNull(),
    amount: money('amount').notNull(),
    currency: text('currency').notNull(),
    alertStatus: text('alert_status', { enum: PACING_STATUSES }),
    createdBy: uuid('created_by').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique().on(t.clientId, t.month), index().on(t.workspaceId, t.month)],
);
