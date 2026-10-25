import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { addMoney, dateIn } from './money';

/** Tên miền shop hợp lệ (`<tên>.myshopify.com`) — chặn chuyển hướng OAuth tới host lạ. */
export const SHOP_DOMAIN = /^[a-z0-9][a-z0-9-]{0,60}\.myshopify\.com$/;
export const SHOPIFY_SCOPES = ['read_orders'] as const;

/** "ten-shop", "ten-shop.myshopify.com" hoặc URL admin → tên miền chuẩn; sai dạng → null. */
export function normalizeShop(input: string): string | null {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
  const shop = s.endsWith('.myshopify.com') ? s : `${s}.myshopify.com`;
  return SHOP_DOMAIN.test(shop) ? shop : null;
}

export function shopifyAuthorizeUrl(p: { shop: string; clientId: string; redirectUri: string; state: string }): string {
  const u = new URL(`https://${p.shop}/admin/oauth/authorize`);
  u.searchParams.set('client_id', p.clientId);
  u.searchParams.set('scope', SHOPIFY_SCOPES.join(','));
  u.searchParams.set('redirect_uri', p.redirectUri);
  u.searchParams.set('state', p.state);
  return u.toString();
}

/** Kiểm `hmac` Shopify gửi kèm callback: HMAC-SHA256 (client secret) của các tham số còn lại, sắp theo khóa. */
export function verifyShopifyHmac(params: Record<string, string>, secret: string): boolean {
  const { hmac, signature: _signature, ...rest } = params;
  if (!hmac || !/^[0-9a-f]{64}$/i.test(hmac)) return false;
  const msg = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${rest[k]}`)
    .join('&');
  const expected = createHmac('sha256', secret).update(msg).digest();
  const got = Buffer.from(hmac, 'hex');
  return got.length === expected.length && timingSafeEqual(got, expected);
}

export type ShopInfo = { name: string; currency: string; timezone: string };
export type DailyOrders = { date: string; orders: number; revenue: string };

export interface ShopifyApi {
  exchangeCode(shop: string, code: string): Promise<{ token: string; scopes: string[] }>;
  shopInfo(shop: string, token: string): Promise<ShopInfo>;
  /** Đơn theo ngày (múi giờ shop) trong [from, to]; bỏ đơn hủy và đơn test. Doanh thu chuỗi thập phân. */
  dailyOrders(
    shop: string,
    token: string,
    range: { from: string; to: string },
    timezone: string,
  ): Promise<DailyOrders[]>;
}

/** Lỗi gọi Shopify: chỉ mang mã (không token, không nội dung trả về). */
export class StoreApiError extends Error {
  constructor(
    readonly status: number,
    code: string,
  ) {
    super(code);
  }
}

const tokenSchema = z.object({ access_token: z.string(), scope: z.string().default('') });
const shopSchema = z.object({
  shop: z.object({ name: z.string(), currency: z.string(), iana_timezone: z.string() }),
});
const ordersSchema = z.object({
  orders: z.array(
    z.object({
      created_at: z.string(),
      current_total_price: z.union([z.string(), z.number()]).transform(String),
      cancelled_at: z.string().nullish(),
      test: z.boolean().nullish(),
    }),
  ),
});

/** Shopify Admin API (REST) — chỉ đọc. */
export class HttpShopify implements ShopifyApi {
  constructor(
    private readonly cfg: { clientId: string; clientSecret: string; apiVersion: string; fetchImpl?: typeof fetch },
  ) {}

  private async get<S extends z.ZodTypeAny>(shop: string, token: string, path: string, schema: S) {
    const res = await (this.cfg.fetchImpl ?? fetch)(`https://${shop}/admin/api/${this.cfg.apiVersion}/${path}`, {
      headers: { 'x-shopify-access-token': token, accept: 'application/json' },
    });
    if (!res.ok) throw new StoreApiError(res.status, `SHOPIFY_HTTP_${res.status}`);
    return { body: schema.parse(await res.json()) as z.infer<S>, link: res.headers.get('link') };
  }

  async exchangeCode(shop: string, code: string) {
    if (!SHOP_DOMAIN.test(shop)) throw new StoreApiError(400, 'SHOPIFY_BAD_SHOP');
    const res = await (this.cfg.fetchImpl ?? fetch)(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ client_id: this.cfg.clientId, client_secret: this.cfg.clientSecret, code }),
    });
    if (!res.ok) throw new StoreApiError(res.status, `SHOPIFY_HTTP_${res.status}`);
    const t = tokenSchema.parse(await res.json());
    return { token: t.access_token, scopes: t.scope.split(',').filter(Boolean) };
  }

  async shopInfo(shop: string, token: string) {
    const { body } = await this.get(shop, token, 'shop.json?fields=name,currency,iana_timezone', shopSchema);
    return { name: body.shop.name, currency: body.shop.currency, timezone: body.shop.iana_timezone };
  }

  async dailyOrders(shop: string, token: string, range: { from: string; to: string }, timezone: string) {
    const byDay = new Map<string, DailyOrders>();
    // Lấy rộng thêm 1 ngày hai đầu (UTC) rồi lọc theo ngày của shop.
    const min = new Date(`${range.from}T00:00:00Z`);
    min.setUTCDate(min.getUTCDate() - 1);
    const max = new Date(`${range.to}T23:59:59Z`);
    max.setUTCDate(max.getUTCDate() + 1);
    let path: string | null =
      'orders.json?status=any&limit=250&fields=created_at,current_total_price,cancelled_at,test' +
      `&created_at_min=${min.toISOString()}&created_at_max=${max.toISOString()}`;
    for (let page = 0; path && page < 200; page++) {
      const res: { body: z.infer<typeof ordersSchema>; link: string | null } = await this.get(
        shop,
        token,
        path,
        ordersSchema,
      );
      const { body, link } = res;
      for (const o of body.orders) {
        if (o.cancelled_at || o.test) continue;
        const d = dateIn(o.created_at, timezone);
        if (d < range.from || d > range.to) continue;
        const cur = byDay.get(d) ?? { date: d, orders: 0, revenue: '0' };
        byDay.set(d, { date: d, orders: cur.orders + 1, revenue: addMoney(cur.revenue, o.current_total_price) });
      }
      const next: string | undefined = link?.match(/<[^>]*[?&]page_info=([^&>]+)[^>]*>;\s*rel="next"/)?.[1];
      path = next
        ? `orders.json?limit=250&fields=created_at,current_total_price,cancelled_at,test&page_info=${next}`
        : null;
    }
    return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  }
}
