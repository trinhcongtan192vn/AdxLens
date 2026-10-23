import { date, index, jsonb, text, uuid } from 'drizzle-orm/pg-core';
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
