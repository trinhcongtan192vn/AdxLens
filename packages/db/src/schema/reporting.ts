import { boolean, date, index, integer, jsonb, text, uuid } from 'drizzle-orm/pg-core';
import { app, createdAt, tsz, updatedAt } from './_common';
import { clients } from './tenancy';

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
