import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { addMoney, dateIn } from './money';
import { StoreApiError } from './shopify';

/** Tiền tệ + múi giờ theo vùng của shop Shopee (ngày của đơn theo múi giờ vùng). */
export const SHOPEE_REGIONS: Record<string, { currency: string; timezone: string }> = {
  VN: { currency: 'VND', timezone: 'Asia/Ho_Chi_Minh' },
  TH: { currency: 'THB', timezone: 'Asia/Bangkok' },
  MY: { currency: 'MYR', timezone: 'Asia/Kuala_Lumpur' },
  SG: { currency: 'SGD', timezone: 'Asia/Singapore' },
  PH: { currency: 'PHP', timezone: 'Asia/Manila' },
  ID: { currency: 'IDR', timezone: 'Asia/Jakarta' },
  TW: { currency: 'TWD', timezone: 'Asia/Taipei' },
  BR: { currency: 'BRL', timezone: 'America/Sao_Paulo' },
};

/** Chữ ký Shopee Open Platform v2: HMAC-SHA256(partner_key, partner_id + path + timestamp [+ access_token + shop_id]). */
export function shopeeSign(
  partnerKey: string,
  p: { partnerId: string; path: string; timestamp: number; accessToken?: string; shopId?: string },
): string {
  const base = `${p.partnerId}${p.path}${p.timestamp}${p.accessToken ?? ''}${p.shopId ?? ''}`;
  return createHmac('sha256', partnerKey).update(base).digest('hex');
}

/** URL ủy quyền shop. Shopee gắn `code` + `shop_id` vào `redirect` (redirect đã mang `state` của AdxLens). */
export function shopeeAuthorizeUrl(p: {
  host: string;
  partnerId: string;
  partnerKey: string;
  redirect: string;
  timestamp: number;
}): string {
  const path = '/api/v2/shop/auth_partner';
  const u = new URL(`${p.host}${path}`);
  u.searchParams.set('partner_id', p.partnerId);
  u.searchParams.set('timestamp', String(p.timestamp));
  u.searchParams.set('sign', shopeeSign(p.partnerKey, { partnerId: p.partnerId, path, timestamp: p.timestamp }));
  u.searchParams.set('redirect', p.redirect);
  return u.toString();
}

export type ShopeeTokens = { accessToken: string; refreshToken: string };
export type ShopeeShop = { name: string; region: string; currency: string; timezone: string };

export interface ShopeeApi {
  exchangeCode(code: string, shopId: string): Promise<ShopeeTokens>;
  /** Làm mới: Shopee trả refresh token MỚI (phải lưu lại; token cũ hết hiệu lực). */
  refresh(refreshToken: string, shopId: string): Promise<ShopeeTokens>;
  shopInfo(accessToken: string, shopId: string): Promise<ShopeeShop>;
  /** Đơn theo ngày (múi giờ vùng) trong [from, to]; bỏ đơn hủy. Doanh thu chuỗi thập phân. */
  dailyOrders(
    accessToken: string,
    shopId: string,
    range: { from: string; to: string },
    timezone: string,
  ): Promise<{ date: string; orders: number; revenue: string }[]>;
}

const tokenSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  error: z.string().optional(),
});
const envelope = <S extends z.ZodTypeAny>(s: S) =>
  z.object({ error: z.string().optional().default(''), response: s.optional() });
const shopSchema = z.object({ shop_name: z.string(), region: z.string() });
const listSchema = z.object({
  more: z.boolean().optional(),
  next_cursor: z.string().optional(),
  order_list: z.array(z.object({ order_sn: z.string() })).default([]),
});
const detailSchema = z.object({
  order_list: z
    .array(
      z.object({
        order_sn: z.string(),
        order_status: z.string(),
        create_time: z.number(),
        total_amount: z.union([z.number(), z.string()]).transform(String),
      }),
    )
    .default([]),
});

const CANCELLED = new Set(['CANCELLED', 'IN_CANCEL']);
/** Shopee giới hạn khoảng thời gian get_order_list 15 ngày. */
const WINDOW_DAYS = 14;

/** Shopee Open Platform v2 — chỉ đọc. Lỗi chỉ mang mã (không token, không nội dung trả về). */
export class HttpShopee implements ShopeeApi {
  constructor(
    private readonly cfg: { host: string; partnerId: string; partnerKey: string; fetchImpl?: typeof fetch },
  ) {}

  private now() {
    return Math.floor(Date.now() / 1000);
  }

  private async call<S extends z.ZodTypeAny>(
    path: string,
    schema: S,
    opts: {
      method?: 'GET' | 'POST';
      query?: Record<string, string>;
      body?: unknown;
      accessToken?: string;
      shopId?: string;
    },
  ): Promise<z.infer<S>> {
    const timestamp = this.now();
    const u = new URL(`${this.cfg.host}${path}`);
    u.searchParams.set('partner_id', this.cfg.partnerId);
    u.searchParams.set('timestamp', String(timestamp));
    if (opts.accessToken) u.searchParams.set('access_token', opts.accessToken);
    if (opts.shopId) u.searchParams.set('shop_id', opts.shopId);
    u.searchParams.set(
      'sign',
      shopeeSign(this.cfg.partnerKey, {
        partnerId: this.cfg.partnerId,
        path,
        timestamp,
        accessToken: opts.accessToken,
        shopId: opts.shopId,
      }),
    );
    for (const [k, v] of Object.entries(opts.query ?? {})) u.searchParams.set(k, v);
    const res = await (this.cfg.fetchImpl ?? fetch)(u, {
      method: opts.method ?? 'GET',
      headers: { 'content-type': 'application/json' },
      ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
    });
    if (!res.ok) throw new StoreApiError(res.status, `SHOPEE_HTTP_${res.status}`);
    const json: unknown = await res.json();
    const err = (json as { error?: string }).error;
    if (err) throw new StoreApiError(400, err.includes('token') ? 'SHOPEE_HTTP_401' : 'SHOPEE_API_ERROR');
    return schema.parse(json) as z.infer<S>;
  }

  async exchangeCode(code: string, shopId: string) {
    const t = await this.call('/api/v2/auth/token/get', tokenSchema, {
      method: 'POST',
      body: { code, shop_id: Number(shopId), partner_id: Number(this.cfg.partnerId) },
    });
    return { accessToken: t.access_token, refreshToken: t.refresh_token };
  }

  async refresh(refreshToken: string, shopId: string) {
    const t = await this.call('/api/v2/auth/access_token/get', tokenSchema, {
      method: 'POST',
      body: { refresh_token: refreshToken, shop_id: Number(shopId), partner_id: Number(this.cfg.partnerId) },
    });
    return { accessToken: t.access_token, refreshToken: t.refresh_token };
  }

  async shopInfo(accessToken: string, shopId: string) {
    const s = await this.call('/api/v2/shop/get_shop_info', shopSchema, { accessToken, shopId });
    const r = SHOPEE_REGIONS[s.region] ?? { currency: '', timezone: 'UTC' };
    return { name: s.shop_name, region: s.region, ...r };
  }

  async dailyOrders(accessToken: string, shopId: string, range: { from: string; to: string }, timezone: string) {
    const byDay = new Map<string, { date: string; orders: number; revenue: string }>();
    // Rộng thêm 1 ngày hai đầu rồi lọc theo ngày của vùng.
    let start = Math.floor(new Date(`${range.from}T00:00:00Z`).getTime() / 1000) - 86_400;
    const end = Math.floor(new Date(`${range.to}T23:59:59Z`).getTime() / 1000) + 86_400;
    while (start < end) {
      const stop = Math.min(start + WINDOW_DAYS * 86_400, end);
      let cursor = '';
      for (let page = 0; page < 200; page++) {
        const list = await this.call('/api/v2/order/get_order_list', envelope(listSchema), {
          accessToken,
          shopId,
          query: {
            time_range_field: 'create_time',
            time_from: String(start),
            time_to: String(stop),
            page_size: '100',
            cursor,
          },
        });
        const sns = (list.response?.order_list ?? []).map((o) => o.order_sn);
        for (let i = 0; i < sns.length; i += 50) {
          const detail = await this.call('/api/v2/order/get_order_detail', envelope(detailSchema), {
            accessToken,
            shopId,
            query: {
              order_sn_list: sns.slice(i, i + 50).join(','),
              response_optional_fields: 'total_amount',
            },
          });
          for (const o of detail.response?.order_list ?? []) {
            if (CANCELLED.has(o.order_status)) continue;
            const d = dateIn(new Date(o.create_time * 1000).toISOString(), timezone);
            if (d < range.from || d > range.to) continue;
            const cur = byDay.get(d) ?? { date: d, orders: 0, revenue: '0' };
            byDay.set(d, { date: d, orders: cur.orders + 1, revenue: addMoney(cur.revenue, o.total_amount) });
          }
        }
        if (!list.response?.more || !list.response.next_cursor) break;
        cursor = list.response.next_cursor;
      }
      start = stop;
    }
    return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  }
}
