import { customType, date, index, integer, primaryKey, text, unique, uuid } from 'drizzle-orm/pg-core';
import { analytics, app, createdAt, money, tsz, updatedAt } from './_common';
import { clients, workspaces } from './tenancy';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

export const STORE_PROVIDERS = ['shopify', 'ga4', 'shopee'] as const;
export const STORE_STATUSES = ['active', 'error', 'revoked'] as const;

/**
 * ADR-0029: kết nối cửa hàng / analytics (Shopify, GA4) theo workspace, gắn một Client. Token mã hóa như token Meta
 * (web chỉ mã hóa, worker giải mã); không bao giờ trả qua API hay ghi log.
 */
export const storeConnections = app.table(
  'store_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').references(() => clients.id, { onDelete: 'set null' }),
    provider: text('provider', { enum: STORE_PROVIDERS }).notNull(),
    /** Tên miền shop (`x.myshopify.com`) hoặc GA4 property id. */
    externalId: text('external_id').notNull(),
    name: text('name').notNull(),
    currency: text('currency'),
    timezone: text('timezone'),
    tokenCiphertext: bytea('token_ciphertext'),
    tokenKeyVersion: integer('token_key_version'),
    status: text('status', { enum: STORE_STATUSES }).notNull().default('active'),
    lastSyncedAt: tsz('last_synced_at'),
    /** Mã lỗi gần nhất (không nội dung từ nhà cung cấp). */
    lastError: text('last_error'),
    createdBy: uuid('created_by').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique().on(t.workspaceId, t.provider, t.externalId), index().on(t.workspaceId, t.clientId)],
);

/** ADR-0029: số liệu ngày của shop / property (ngày theo múi giờ của shop / property). Tiền numeric. */
export const storeDaily = analytics.table(
  'store_daily',
  {
    workspaceId: uuid('workspace_id').notNull(),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => storeConnections.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    orders: integer('orders'),
    revenue: money('revenue'),
    sessions: integer('sessions'),
    conversions: integer('conversions'),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.connectionId, t.date] }), index().on(t.workspaceId)],
);
