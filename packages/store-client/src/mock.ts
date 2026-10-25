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
