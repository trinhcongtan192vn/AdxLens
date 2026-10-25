import { z } from 'zod';
import { StoreApiError } from './shopify';

export const GA4_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
/** Property ID của GA4 (chỉ số, vd. 123456789). */
export const GA4_PROPERTY = /^\d{5,15}$/;

export function googleAuthorizeUrl(p: { clientId: string; redirectUri: string; state: string }): string {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.searchParams.set('client_id', p.clientId);
  u.searchParams.set('redirect_uri', p.redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', GA4_SCOPE);
  // offline + consent: luôn nhận refresh token (đồng bộ hằng ngày không cần người dùng).
  u.searchParams.set('access_type', 'offline');
  u.searchParams.set('prompt', 'consent');
  u.searchParams.set('include_granted_scopes', 'true');
  u.searchParams.set('state', p.state);
  return u.toString();
}

export type Ga4Property = { name: string; currency: string; timezone: string };
export type Ga4Daily = { date: string; sessions: number; conversions: number };

export interface GoogleAnalyticsApi {
  /** Đổi code lấy refresh token (bắt buộc có — `access_type=offline`). */
  exchangeCode(code: string, redirectUri: string): Promise<{ refreshToken: string; accessToken: string }>;
  accessToken(refreshToken: string): Promise<string>;
  property(accessToken: string, propertyId: string): Promise<Ga4Property>;
  /** Phiên + chuyển đổi (key events) theo ngày của property trong [from, to]. */
  daily(accessToken: string, propertyId: string, range: { from: string; to: string }): Promise<Ga4Daily[]>;
}

const tokenSchema = z.object({ access_token: z.string(), refresh_token: z.string().optional() });
const propertySchema = z.object({ displayName: z.string(), currencyCode: z.string().nullish(), timeZone: z.string() });
const reportSchema = z.object({
  rows: z
    .array(
      z.object({
        dimensionValues: z.array(z.object({ value: z.string() })),
        metricValues: z.array(z.object({ value: z.string() })),
      }),
    )
    .optional(),
});

/** Google OAuth + Analytics Admin / Data API — chỉ đọc. Lỗi chỉ mang mã HTTP. */
export class HttpGoogleAnalytics implements GoogleAnalyticsApi {
  constructor(private readonly cfg: { clientId: string; clientSecret: string; fetchImpl?: typeof fetch }) {}

  private f() {
    return this.cfg.fetchImpl ?? fetch;
  }

  private async token(body: Record<string, string>) {
    const res = await this.f()('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: this.cfg.clientId, client_secret: this.cfg.clientSecret, ...body }),
    });
    if (!res.ok) throw new StoreApiError(res.status, `GA4_HTTP_${res.status}`);
    return tokenSchema.parse(await res.json());
  }

  async exchangeCode(code: string, redirectUri: string) {
    const t = await this.token({ code, redirect_uri: redirectUri, grant_type: 'authorization_code' });
    if (!t.refresh_token) throw new StoreApiError(400, 'GA4_NO_REFRESH_TOKEN');
    return { refreshToken: t.refresh_token, accessToken: t.access_token };
  }

  async accessToken(refreshToken: string) {
    return (await this.token({ refresh_token: refreshToken, grant_type: 'refresh_token' })).access_token;
  }

  async property(accessToken: string, propertyId: string) {
    if (!GA4_PROPERTY.test(propertyId)) throw new StoreApiError(400, 'GA4_BAD_PROPERTY');
    const res = await this.f()(`https://analyticsadmin.googleapis.com/v1beta/properties/${propertyId}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new StoreApiError(res.status, `GA4_HTTP_${res.status}`);
    const p = propertySchema.parse(await res.json());
    return { name: p.displayName, currency: p.currencyCode ?? '', timezone: p.timeZone };
  }

  async daily(accessToken: string, propertyId: string, range: { from: string; to: string }) {
    if (!GA4_PROPERTY.test(propertyId)) throw new StoreApiError(400, 'GA4_BAD_PROPERTY');
    const res = await this.f()(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        dateRanges: [{ startDate: range.from, endDate: range.to }],
        dimensions: [{ name: 'date' }],
        metrics: [{ name: 'sessions' }, { name: 'keyEvents' }],
        limit: 1000,
      }),
    });
    if (!res.ok) throw new StoreApiError(res.status, `GA4_HTTP_${res.status}`);
    const r = reportSchema.parse(await res.json());
    return (r.rows ?? [])
      .map((row) => {
        const d = row.dimensionValues[0]?.value ?? '';
        return {
          date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
          sessions: Math.round(Number(row.metricValues[0]?.value ?? 0)),
          conversions: Math.round(Number(row.metricValues[1]?.value ?? 0)),
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }
}
