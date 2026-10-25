import { and, eq, gte, inArray, isNotNull, lte, sql } from 'drizzle-orm';
import type { Db } from '@adxlens/db';
import { schema } from '@adxlens/db';
import { HttpGoogleAnalytics, HttpShopify, type GoogleAnalyticsApi, type ShopifyApi } from '@adxlens/store-client';
import { MockGoogleAnalytics, MockShopify } from '@adxlens/store-client/mock';
import { decryptSecret, encryptSecret, type TokenKeys } from '@adxlens/core/connections';
import {
  addDays,
  AppError,
  localDate,
  notFound,
  systemClock,
  type ActorCtx,
  type Clock,
  type WorkspaceCtx,
} from '@adxlens/core/shared';
import { assertCan, getClient } from '@adxlens/core/tenancy';

const { storeConnections, storeDaily } = schema;

export type StoreProvider = (typeof schema.STORE_PROVIDERS)[number];
/** Số ngày lấy khi vừa kết nối, và lấy lại mỗi ngày (như Meta: ngày gần có thể còn đổi). */
export const STORE_BACKFILL_DAYS = 30;
export const STORE_DAILY_DAYS = 3;
/** Giờ địa phương của shop / property chạy đồng bộ hằng ngày (cùng giờ với Meta). */
export const STORE_SYNC_HOUR = 3;

/** Thông tin kết nối (không bao giờ có token / bản mã). */
export type StoreConnectionInfo = {
  id: string;
  provider: StoreProvider;
  externalId: string;
  name: string;
  currency: string | null;
  timezone: string | null;
  clientId: string | null;
  status: string;
  lastSyncedAt: Date | null;
  lastError: string | null;
};

const INFO = {
  id: storeConnections.id,
  provider: storeConnections.provider,
  externalId: storeConnections.externalId,
  name: storeConnections.name,
  currency: storeConnections.currency,
  timezone: storeConnections.timezone,
  clientId: storeConnections.clientId,
  status: storeConnections.status,
  lastSyncedAt: storeConnections.lastSyncedAt,
  lastError: storeConnections.lastError,
};

/**
 * Lưu kết nối sau OAuth (web chỉ mã hóa token, ADR-0029). Kết nối lại cùng shop / property → thay token, giữ Client đã
 * gắn. Trả id để enqueue đồng bộ 30 ngày.
 */
export async function saveStoreConnection(
  ctx: ActorCtx,
  input: {
    provider: StoreProvider;
    externalId: string;
    name: string;
    currency: string | null;
    timezone: string | null;
    token: string;
    clientId?: string | null;
  },
  keys: { keys: TokenKeys; current: number },
): Promise<{ id: string }> {
  assertCan(ctx.actor, 'connections.manage');
  if (input.clientId) await getClient(ctx, input.clientId);
  const { blob, version } = encryptSecret(input.token, keys);
  const set = {
    name: input.name.slice(0, 200),
    currency: input.currency,
    timezone: input.timezone,
    tokenCiphertext: blob,
    tokenKeyVersion: version,
    status: 'active' as const,
    lastError: null,
    updatedAt: new Date(),
  };
  const [row] = await ctx.db
    .insert(storeConnections)
    .values({
      workspaceId: ctx.workspaceId,
      provider: input.provider,
      externalId: input.externalId,
      clientId: input.clientId ?? null,
      createdBy: ctx.actor.userId,
      ...set,
    })
    .onConflictDoUpdate({
      target: [storeConnections.workspaceId, storeConnections.provider, storeConnections.externalId],
      set: input.clientId ? { ...set, clientId: input.clientId } : set,
    })
    .returning({ id: storeConnections.id });
  return row!;
}

export async function listStoreConnections(ctx: WorkspaceCtx): Promise<StoreConnectionInfo[]> {
  return ctx.db
    .select(INFO)
    .from(storeConnections)
    .where(and(eq(storeConnections.workspaceId, ctx.workspaceId), sql`${storeConnections.status} <> 'revoked'`))
    .orderBy(storeConnections.provider, storeConnections.name);
}

async function own(ctx: WorkspaceCtx, id: string) {
  const [row] = await ctx.db
    .select()
    .from(storeConnections)
    .where(and(eq(storeConnections.workspaceId, ctx.workspaceId), eq(storeConnections.id, id)));
  if (!row || row.status === 'revoked') throw notFound('Kết nối');
  return row;
}

/** Gắn shop / property với một Client (hoặc bỏ gắn). */
export async function assignStoreClient(ctx: ActorCtx, id: string, clientId: string | null): Promise<void> {
  assertCan(ctx.actor, 'connections.manage');
  await own(ctx, id);
  if (clientId) await getClient(ctx, clientId);
  await ctx.db
    .update(storeConnections)
    .set({ clientId, updatedAt: new Date() })
    .where(and(eq(storeConnections.workspaceId, ctx.workspaceId), eq(storeConnections.id, id)));
}

/** Ngắt kết nối: xóa token ngay và số liệu ngày của kết nối (ADR-0029 mục 7). */
export async function disconnectStore(ctx: ActorCtx, id: string): Promise<void> {
  assertCan(ctx.actor, 'connections.manage');
  await own(ctx, id);
  await ctx.db.transaction(async (tx) => {
    await tx
      .delete(storeDaily)
      .where(and(eq(storeDaily.workspaceId, ctx.workspaceId), eq(storeDaily.connectionId, id)));
    await tx
      .update(storeConnections)
      .set({ status: 'revoked', tokenCiphertext: null, tokenKeyVersion: null, updatedAt: new Date() })
      .where(and(eq(storeConnections.workspaceId, ctx.workspaceId), eq(storeConnections.id, id)));
  });
}

/**
 * CHỈ worker (job `sync:store_daily`): giải mã token, lấy số liệu theo ngày và ghi đè các ngày trong khoảng. Lỗi → ghi
 * mã lỗi (không nội dung từ nhà cung cấp); 401 / 403 → trạng thái `error` (cần kết nối lại).
 */
export async function runStoreSync(
  ctx: WorkspaceCtx,
  input: { connectionId: string; from?: string; to?: string; days?: number },
  deps: { shopify: ShopifyApi; ga4?: GoogleAnalyticsApi; keys: TokenKeys; clock?: Clock },
): Promise<{ status: 'ok' | 'skipped' | 'failed'; days?: number; code?: string }> {
  const [c] = await ctx.db
    .select()
    .from(storeConnections)
    .where(and(eq(storeConnections.workspaceId, ctx.workspaceId), eq(storeConnections.id, input.connectionId)));
  if (!c || c.status === 'revoked' || !c.tokenCiphertext || c.tokenKeyVersion === null) return { status: 'skipped' };
  const tz = c.timezone ?? 'UTC';
  const yesterday = addDays(localDate((deps.clock ?? systemClock).now(), tz), -1);
  const to = input.to ?? yesterday;
  const from = input.from ?? addDays(to, -((input.days ?? STORE_DAILY_DAYS) - 1));
  try {
    const token = decryptSecret(c.tokenCiphertext, c.tokenKeyVersion, deps.keys);
    if (c.provider === 'ga4') {
      // Token lưu là refresh token; doanh thu GA4 không ghi (tránh tính trùng với doanh thu cửa hàng).
      if (!deps.ga4) return { status: 'skipped' };
      const access = await deps.ga4.accessToken(token);
      const days = await deps.ga4.daily(access, c.externalId, { from, to });
      for (const r of days) {
        await ctx.db
          .insert(storeDaily)
          .values({
            workspaceId: ctx.workspaceId,
            connectionId: c.id,
            date: r.date,
            sessions: r.sessions,
            conversions: r.conversions,
          })
          .onConflictDoUpdate({
            target: [storeDaily.connectionId, storeDaily.date],
            set: { sessions: r.sessions, conversions: r.conversions, updatedAt: new Date() },
          });
      }
      await ctx.db
        .update(storeConnections)
        .set({ status: 'active', lastSyncedAt: new Date(), lastError: null })
        .where(and(eq(storeConnections.workspaceId, ctx.workspaceId), eq(storeConnections.id, c.id)));
      return { status: 'ok', days: days.length };
    }
    const rows = await deps.shopify.dailyOrders(c.externalId, token, { from, to }, tz);
    for (const r of rows) {
      await ctx.db
        .insert(storeDaily)
        .values({
          workspaceId: ctx.workspaceId,
          connectionId: c.id,
          date: r.date,
          orders: r.orders,
          revenue: r.revenue,
        })
        .onConflictDoUpdate({
          target: [storeDaily.connectionId, storeDaily.date],
          set: { orders: r.orders, revenue: r.revenue, updatedAt: new Date() },
        });
    }
    await ctx.db
      .update(storeConnections)
      .set({ status: 'active', lastSyncedAt: new Date(), lastError: null })
      .where(and(eq(storeConnections.workspaceId, ctx.workspaceId), eq(storeConnections.id, c.id)));
    return { status: 'ok', days: rows.length };
  } catch (e) {
    const code = e instanceof Error && /^[A-Z0-9_]{3,40}$/.test(e.message) ? e.message : 'STORE_ERROR';
    const auth = /_HTTP_(401|403)$/.test(code);
    await ctx.db
      .update(storeConnections)
      .set({ lastError: code, ...(auth ? { status: 'error' as const } : {}) })
      .where(and(eq(storeConnections.workspaceId, ctx.workspaceId), eq(storeConnections.id, c.id)));
    if (!auth) throw new AppError('INTERNAL', 'Đồng bộ cửa hàng lỗi', { code });
    return { status: 'failed', code };
  }
}

export type StoreSummary = {
  connections: number;
  currency: string | null;
  orders: number | null;
  revenue: string | null;
  sessions: number | null;
  conversions: number | null;
};

/** Tổng số liệu cửa hàng / GA4 của các Client trong kỳ (ADR-0029). Tiền chỉ cộng khi cùng tiền tệ. */
export async function storeSummary(
  ctx: WorkspaceCtx,
  clientIds: string[],
  range: { from: string; to: string },
): Promise<StoreSummary> {
  const empty = { connections: 0, currency: null, orders: null, revenue: null, sessions: null, conversions: null };
  if (!clientIds.length) return empty;
  const conns = await ctx.db
    .select({ id: storeConnections.id, provider: storeConnections.provider, currency: storeConnections.currency })
    .from(storeConnections)
    .where(
      and(
        eq(storeConnections.workspaceId, ctx.workspaceId),
        inArray(storeConnections.clientId, clientIds),
        isNotNull(storeConnections.tokenCiphertext),
        sql`${storeConnections.status} <> 'revoked'`,
      ),
    );
  if (!conns.length) return empty;
  const [s] = await ctx.db
    .select({
      orders: sql<string | null>`sum(${storeDaily.orders})::text`,
      revenue: sql<string | null>`sum(${storeDaily.revenue})::text`,
      sessions: sql<string | null>`sum(${storeDaily.sessions})::text`,
      conversions: sql<string | null>`sum(${storeDaily.conversions})::text`,
    })
    .from(storeDaily)
    .where(
      and(
        eq(storeDaily.workspaceId, ctx.workspaceId),
        inArray(
          storeDaily.connectionId,
          conns.map((c) => c.id),
        ),
        gte(storeDaily.date, range.from),
        lte(storeDaily.date, range.to),
      ),
    );
  const currencies = [...new Set(conns.filter((c) => c.provider === 'shopify').map((c) => c.currency ?? ''))];
  const single = currencies.length === 1 ? currencies[0]! : null;
  return {
    connections: conns.length,
    currency: single,
    orders: s?.orders == null ? null : Number(s.orders),
    revenue: single && s?.revenue != null ? s.revenue : null,
    sessions: s?.sessions == null ? null : Number(s.sessions),
    conversions: s?.conversions == null ? null : Number(s.conversions),
  };
}

/**
 * Truy vấn XUYÊN WORKSPACE có chủ đích (CLAUDE.md quy tắc 1, như `dueDailySyncs`): scheduler tìm kết nối cửa hàng đang
 * ở giờ đồng bộ theo múi giờ của shop / property. Chỉ trả định danh; xử lý chạy trong workspace của kết nối.
 */
export async function dueStoreSyncs(db: Db, now: Date): Promise<{ workspaceId: string; connectionId: string }[]> {
  return db
    .select({ workspaceId: storeConnections.workspaceId, connectionId: storeConnections.id })
    .from(storeConnections)
    .where(
      and(
        eq(storeConnections.status, 'active'),
        isNotNull(storeConnections.tokenCiphertext),
        sql`extract(hour from (${now.toISOString()}::timestamptz at time zone coalesce(${storeConnections.timezone}, 'UTC'))) = ${STORE_SYNC_HOUR}`,
      ),
    );
}

/** Client Shopify thật hoặc giả (STORE_MOCK) — dùng chung cho web (OAuth) và worker (đồng bộ). */
export function shopifyApi(cfg: {
  mock: boolean;
  clientId?: string;
  clientSecret?: string;
  apiVersion: string;
}): ShopifyApi {
  return cfg.mock
    ? new MockShopify()
    : new HttpShopify({
        clientId: cfg.clientId ?? '',
        clientSecret: cfg.clientSecret ?? '',
        apiVersion: cfg.apiVersion,
      });
}

/** Google Analytics thật hoặc giả (STORE_MOCK). */
export function googleAnalyticsApi(cfg: {
  mock: boolean;
  clientId?: string;
  clientSecret?: string;
}): GoogleAnalyticsApi {
  return cfg.mock
    ? new MockGoogleAnalytics()
    : new HttpGoogleAnalytics({ clientId: cfg.clientId ?? '', clientSecret: cfg.clientSecret ?? '' });
}
