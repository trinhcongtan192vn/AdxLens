import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { addMoney, dateIn } from './money';
import { StoreApiError } from './shopify';

/** Tiền tệ + múi giờ theo vùng của shop TikTok (ngày của đơn theo múi giờ vùng). */
export const TIKTOK_REGIONS: Record<string, { currency: string; timezone: string }> = {
  VN: { currency: 'VND', timezone: 'Asia/Ho_Chi_Minh' },
  TH: { currency: 'THB', timezone: 'Asia/Bangkok' },
  MY: { currency: 'MYR', timezone: 'Asia/Kuala_Lumpur' },
  SG: { currency: 'SGD', timezone: 'Asia/Singapore' },
  PH: { currency: 'PHP', timezone: 'Asia/Manila' },
  ID: { currency: 'IDR', timezone: 'Asia/Jakarta' },
  US: { currency: 'USD', timezone: 'America/Los_Angeles' },
  GB: { currency: 'GBP', timezone: 'Europe/London' },
};

export const TIKTOK_API_HOST = 'https://open-api.tiktokglobalshop.com';
export const TIKTOK_AUTH_HOST = 'https://auth.tiktok-shops.com';

/**
 * Chữ ký TikTok Shop Open API (202309): HMAC-SHA256(app_secret, app_secret + path + các tham số đã sắp xếp (bỏ `sign`,
 * `access_token`) dạng key+value + body + app_secret), hex.
 */
export function tiktokSign(
  appSecret: string,
  p: { path: string; query: Record<string, string>; body?: string },
): string {
  const params = Object.keys(p.query)
    .filter((k) => k !== 'sign' && k !== 'access_token')
    .sort()
    .map((k) => `${k}${p.query[k]}`)
    .join('');
  const base = `${appSecret}${p.path}${params}${p.body ?? ''}${appSecret}`;
  return createHmac('sha256', appSecret).update(base).digest('hex');
}

/** URL ủy quyền (Partner Center → service id của app). */
export function tiktokAuthorizeUrl(p: { serviceId: string; state: string }): string {
  const u = new URL('https://services.tiktokshop.com/open/authorize');
  u.searchParams.set('service_id', p.serviceId);
  u.searchParams.set('state', p.state);
  return u.toString();
}

export type TiktokTokens = { accessToken: string; refreshToken: string };
export type TiktokShop = {
  id: string;
  cipher: string;
  name: string;
  region: string;
  currency: string;
  timezone: string;
};

export interface TiktokShopApi {
  exchangeCode(code: string): Promise<TiktokTokens>;
  /** Làm mới token; TikTok có thể trả refresh token mới — luôn lưu lại cái được trả về. */
  refresh(refreshToken: string): Promise<TiktokTokens>;
  /** Các shop mà lần ủy quyền này cho phép đọc. */
  shops(accessToken: string): Promise<TiktokShop[]>;
  /** Đơn theo ngày (múi giờ vùng) trong [from, to]; bỏ đơn hủy. Doanh thu chuỗi thập phân. */
  dailyOrders(
    accessToken: string,
    shopCipher: string,
    range: { from: string; to: string },
    timezone: string,
  ): Promise<{ date: string; orders: number; revenue: string }[]>;
}

const tokenSchema = z.object({
  code: z.number(),
  data: z.object({ access_token: z.string(), refresh_token: z.string() }).optional(),
});
const shopsSchema = z.object({
  code: z.number(),
  data: z
    .object({
      shops: z
        .array(z.object({ id: z.string(), cipher: z.string(), name: z.string(), region: z.string() }))
        .default([]),
    })
    .optional(),
});
const ordersSchema = z.object({
  code: z.number(),
  data: z
    .object({
      next_page_token: z.string().optional(),
      orders: z
        .array(
          z.object({
            status: z.string(),
            create_time: z.number(),
            payment: z.object({ total_amount: z.union([z.string(), z.number()]).transform(String) }).optional(),
          }),
        )
        .default([]),
    })
    .optional(),
});

const CANCELLED = new Set(['CANCELLED', 'CANCEL']);
/** Mã lỗi token của TikTok (hết hạn / không hợp lệ). */
const AUTH_CODES = new Set([105001, 105002, 105005, 36004004]);

/** TikTok Shop Open API (202309) — chỉ đọc. Lỗi chỉ mang mã. */
export class HttpTiktokShop implements TiktokShopApi {
  constructor(private readonly cfg: { appKey: string; appSecret: string; fetchImpl?: typeof fetch }) {}

  private f() {
    return this.cfg.fetchImpl ?? fetch;
  }

  private fail(status: number, code: number): never {
    throw new StoreApiError(status, AUTH_CODES.has(code) ? 'TIKTOK_HTTP_401' : 'TIKTOK_API_ERROR');
  }

  private async token(path: string, query: Record<string, string>) {
    const u = new URL(`${TIKTOK_AUTH_HOST}${path}`);
    for (const [k, v] of Object.entries({ app_key: this.cfg.appKey, app_secret: this.cfg.appSecret, ...query })) {
      u.searchParams.set(k, v);
    }
    const res = await this.f()(u);
    if (!res.ok) throw new StoreApiError(res.status, `TIKTOK_HTTP_${res.status}`);
    const t = tokenSchema.parse(await res.json());
    if (t.code !== 0 || !t.data) this.fail(400, t.code);
    return { accessToken: t.data.access_token, refreshToken: t.data.refresh_token };
  }

  exchangeCode(code: string) {
    return this.token('/api/v2/token/get', { auth_code: code, grant_type: 'authorized_code' });
  }

  refresh(refreshToken: string) {
    return this.token('/api/v2/token/refresh', { refresh_token: refreshToken, grant_type: 'refresh_token' });
  }

  private async api<S extends z.ZodTypeAny>(
    path: string,
    schema: S,
    opts: { accessToken: string; query?: Record<string, string>; body?: unknown },
  ): Promise<z.infer<S>> {
    const query: Record<string, string> = {
      app_key: this.cfg.appKey,
      timestamp: String(Math.floor(Date.now() / 1000)),
      ...(opts.query ?? {}),
    };
    const body = opts.body === undefined ? undefined : JSON.stringify(opts.body);
    query.sign = tiktokSign(this.cfg.appSecret, { path, query, body });
    const u = new URL(`${TIKTOK_API_HOST}${path}`);
    for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
    const res = await this.f()(u, {
      method: body ? 'POST' : 'GET',
      headers: { 'content-type': 'application/json', 'x-tts-access-token': opts.accessToken },
      ...(body ? { body } : {}),
    });
    if (!res.ok) throw new StoreApiError(res.status, `TIKTOK_HTTP_${res.status}`);
    const json = schema.parse(await res.json()) as z.infer<S> & { code: number };
    if (json.code !== 0) this.fail(400, json.code);
    return json;
  }

  async shops(accessToken: string) {
    const r = await this.api('/authorization/202309/shops', shopsSchema, { accessToken });
    return (r.data?.shops ?? []).map((s) => {
      const reg = TIKTOK_REGIONS[s.region] ?? { currency: '', timezone: 'UTC' };
      return { id: s.id, cipher: s.cipher, name: s.name, region: s.region, ...reg };
    });
  }

  async dailyOrders(accessToken: string, shopCipher: string, range: { from: string; to: string }, timezone: string) {
    const byDay = new Map<string, { date: string; orders: number; revenue: string }>();
    const ge = Math.floor(new Date(`${range.from}T00:00:00Z`).getTime() / 1000) - 86_400;
    const lt = Math.floor(new Date(`${range.to}T23:59:59Z`).getTime() / 1000) + 86_400;
    let pageToken = '';
    for (let page = 0; page < 500; page++) {
      const r = await this.api('/order/202309/orders/search', ordersSchema, {
        accessToken,
        query: { shop_cipher: shopCipher, page_size: '100', ...(pageToken ? { page_token: pageToken } : {}) },
        body: { create_time_ge: ge, create_time_lt: lt },
      });
      for (const o of r.data?.orders ?? []) {
        if (CANCELLED.has(o.status)) continue;
        const d = dateIn(new Date(o.create_time * 1000).toISOString(), timezone);
        if (d < range.from || d > range.to) continue;
        const cur = byDay.get(d) ?? { date: d, orders: 0, revenue: '0' };
        byDay.set(d, {
          date: d,
          orders: cur.orders + 1,
          revenue: addMoney(cur.revenue, o.payment?.total_amount ?? '0'),
        });
      }
      if (!r.data?.next_page_token) break;
      pageToken = r.data.next_page_token;
    }
    return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  }
}
