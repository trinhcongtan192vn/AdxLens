import type { GoogleAnalyticsApi } from './ga4';
import type { ShopifyApi } from './shopify';

/** Shopify giả (STORE_MOCK=1, local / test): số đơn / doanh thu xác định theo ngày. */
export class MockShopify implements ShopifyApi {
  async exchangeCode(_shop: string, code: string) {
    if (code === 'bad') throw new Error('SHOPIFY_HTTP_400');
    return { token: `shpat_mock_${code}`, scopes: ['read_orders'] };
  }

  async shopInfo(shop: string) {
    return { name: shop.replace('.myshopify.com', ''), currency: 'VND', timezone: 'Asia/Ho_Chi_Minh' };
  }

  async dailyOrders(_shop: string, _token: string, range: { from: string; to: string }) {
    const out: { date: string; orders: number; revenue: string }[] = [];
    const end = new Date(`${range.to}T00:00:00Z`);
    for (let d = new Date(`${range.from}T00:00:00Z`); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const n = 8 + (d.getUTCDate() % 5);
      out.push({ date: d.toISOString().slice(0, 10), orders: n, revenue: String(n * 450_000) });
    }
    return out;
  }
}

/** GA4 giả (STORE_MOCK=1): phiên / chuyển đổi xác định theo ngày. */
export class MockGoogleAnalytics implements GoogleAnalyticsApi {
  async exchangeCode(code: string) {
    if (code === 'bad') throw new Error('GA4_HTTP_400');
    return { refreshToken: `1//mock_refresh_${code}`, accessToken: 'ya29.mock' };
  }

  async accessToken() {
    return 'ya29.mock';
  }

  async property(_t: string, propertyId: string) {
    if (propertyId === '99999') throw new Error('GA4_HTTP_403');
    return { name: `GA4 ${propertyId}`, currency: 'VND', timezone: 'Asia/Ho_Chi_Minh' };
  }

  async daily(_t: string, _p: string, range: { from: string; to: string }) {
    const out: { date: string; sessions: number; conversions: number }[] = [];
    const end = new Date(`${range.to}T00:00:00Z`);
    for (let d = new Date(`${range.from}T00:00:00Z`); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      out.push({
        date: d.toISOString().slice(0, 10),
        sessions: 400 + d.getUTCDate() * 3,
        conversions: 20 + (d.getUTCDate() % 4),
      });
    }
    return out;
  }
}
