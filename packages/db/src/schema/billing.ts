import { bigserial, boolean, integer, numeric, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { app, createdAt, tsz, updatedAt } from './_common';
import { workspaces } from './tenancy';

/**
 * Cấu hình gói (roadmap 026: giá không hard-code). Bảng toàn hệ thống — không có workspace_id; RLS bật,
 * không policy cho người dùng (chỉ server đọc). PM chỉnh giá ở đây; code dùng giá trị mặc định khi thiếu.
 */
export const billingPlans = app.table('billing_plans', {
  key: text('key').primaryKey(),
  /** VND/tháng (số nguyên đồng, numeric — không float). */
  monthlyPriceVnd: numeric('monthly_price_vnd', { precision: 14, scale: 0 }).notNull(),
  monthlyPriceUsd: numeric('monthly_price_usd', { precision: 10, scale: 2 }),
  includedAccounts: integer('included_accounts').notNull(),
  extraAccountVnd: numeric('extra_account_vnd', { precision: 14, scale: 0 }).notNull().default('0'),
  entitlements: text('entitlements').array().notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  active: boolean('active').notNull().default(true),
  updatedAt: updatedAt(),
});

export const SUBSCRIPTION_STATUSES = ['active', 'past_due', 'canceled'] as const;
export const BILLING_PERIODS = ['monthly', 'annual'] as const;
export const BILLING_PROVIDERS = ['none', 'stripe', 'payos'] as const;

/**
 * Gói của workspace. Không có dòng = Free (ADR-0001 A5). `over_limit_since`/`past_due_since` mở ân hạn
 * 7 ngày (ADR-0001 A8, PRD 13.3).
 */
export const subscriptions = app.table('subscriptions', {
  workspaceId: uuid('workspace_id')
    .primaryKey()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  planKey: text('plan_key').notNull(),
  status: text('status', { enum: SUBSCRIPTION_STATUSES }).notNull().default('active'),
  period: text('period', { enum: BILLING_PERIODS }).notNull().default('monthly'),
  provider: text('provider', { enum: BILLING_PROVIDERS }).notNull().default('none'),
  providerCustomerId: text('provider_customer_id'),
  providerSubscriptionId: text('provider_subscription_id'),
  currentPeriodEnd: tsz('current_period_end'),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  pastDueSince: tsz('past_due_since'),
  overLimitSince: tsz('over_limit_since'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * Sự kiện webhook thanh toán đã xử lý (027/028): chống xử lý trùng (idempotent). `workspace_id` có khi
 * xác định được workspace; sự kiện không thuộc workspace nào vẫn lưu để không xử lý lại.
 */
export const billingEvents = app.table(
  'billing_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: text('provider', { enum: BILLING_PROVIDERS }).notNull(),
    eventId: text('event_id').notNull(),
    type: text('type').notNull(),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('billing_events_provider_event_uq').on(t.provider, t.eventId)],
);

/** Thông tin xuất hóa đơn (ST03): tên công ty, mã số thuế, địa chỉ, email nhận hóa đơn. */
export const billingProfiles = app.table('billing_profiles', {
  workspaceId: uuid('workspace_id')
    .primaryKey()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  companyName: text('company_name').notNull(),
  taxCode: text('tax_code'),
  address: text('address'),
  invoiceEmail: text('invoice_email').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const PAYMENT_ORDER_STATUSES = ['pending', 'paid', 'canceled', 'expired'] as const;

/**
 * Đơn thanh toán theo kỳ qua cổng VN (028, PayOS): mỗi kỳ một đơn. `order_code` là số nguyên do DB cấp
 * (PayOS yêu cầu số). Số tiền VND `numeric` — webhook phải khớp đúng số tiền này mới ghi nhận.
 */
export const paymentOrders = app.table(
  'payment_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    provider: text('provider', { enum: BILLING_PROVIDERS }).notNull(),
    orderCode: bigserial('order_code', { mode: 'number' }).notNull(),
    planKey: text('plan_key').notNull(),
    period: text('period', { enum: BILLING_PERIODS }).notNull(),
    amountVnd: numeric('amount_vnd', { precision: 14, scale: 0 }).notNull(),
    status: text('status', { enum: PAYMENT_ORDER_STATUSES }).notNull().default('pending'),
    checkoutUrl: text('checkout_url'),
    paymentLinkId: text('payment_link_id'),
    createdBy: uuid('created_by'),
    paidAt: tsz('paid_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('payment_orders_order_code_uq').on(t.orderCode)],
);
