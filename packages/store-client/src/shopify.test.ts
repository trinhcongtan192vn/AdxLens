import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { addMoney, HttpShopify, normalizeShop, shopifyAuthorizeUrl, verifyShopifyHmac } from './index';

describe('Shopify (ADR-0029)', () => {
  it('chuẩn hóa tên shop; chặn host lạ', () => {
    expect(normalizeShop('Sao-Mai')).toBe('sao-mai.myshopify.com');
    expect(normalizeShop('https://sao-mai.myshopify.com/admin')).toBe('sao-mai.myshopify.com');
    expect(normalizeShop('evil.com/x')).toBeNull();
    expect(normalizeShop('a b')).toBeNull();
    expect(
      shopifyAuthorizeUrl({ shop: 'a.myshopify.com', clientId: 'cid', redirectUri: 'https://x/cb', state: 's' }),
    ).toBe(
      'https://a.myshopify.com/admin/oauth/authorize?client_id=cid&scope=read_orders&redirect_uri=https%3A%2F%2Fx%2Fcb&state=s',
    );
  });

  it('kiểm hmac callback theo client secret (sắp xếp tham số, bỏ hmac)', () => {
    const params = { code: 'c1', shop: 'a.myshopify.com', state: 's', timestamp: '1700000000' };
    const msg = 'code=c1&shop=a.myshopify.com&state=s&timestamp=1700000000';
    const hmac = createHmac('sha256', 'secret').update(msg).digest('hex');
    expect(verifyShopifyHmac({ ...params, hmac }, 'secret')).toBe(true);
    expect(verifyShopifyHmac({ ...params, hmac }, 'khac')).toBe(false);
    expect(verifyShopifyHmac({ ...params, shop: 'b.myshopify.com', hmac }, 'secret')).toBe(false);
    expect(verifyShopifyHmac(params, 'secret')).toBe(false);
  });

  it('cộng tiền không qua float', () => {
    expect(addMoney('0.1', '0.2')).toBe('0.3');
    expect(addMoney('199000', '450000.50')).toBe('649000.5');
    expect(addMoney('-5', '2.25')).toBe('-2.75');
  });

  it('đơn theo ngày của shop: phân trang Link, bỏ đơn hủy / test, ngày theo múi giờ shop', async () => {
    const pages: Record<string, unknown> = {
      first: {
        orders: [
          // 23:30 UTC ngày 20 = 06:30 ngày 21 giờ VN.
          { created_at: '2026-10-20T23:30:00Z', current_total_price: '100000.50', cancelled_at: null, test: false },
          { created_at: '2026-10-21T02:00:00Z', current_total_price: '200000', cancelled_at: '2026-10-21T03:00:00Z' },
          { created_at: '2026-10-21T04:00:00Z', current_total_price: '50000', test: true },
        ],
      },
      second: { orders: [{ created_at: '2026-10-22T01:00:00Z', current_total_price: 300000 }] },
    };
    const urls: string[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      urls.push(url);
      expect((init.headers as Record<string, string>)['x-shopify-access-token']).toBe('tok');
      const second = url.includes('page_info=p2');
      return new Response(JSON.stringify(second ? pages.second : pages.first), {
        status: 200,
        headers: second
          ? {}
          : { link: '<https://a.myshopify.com/admin/api/2025-07/orders.json?page_info=p2>; rel="next"' },
      });
    }) as unknown as typeof fetch;
    const api = new HttpShopify({ clientId: 'c', clientSecret: 's', apiVersion: '2025-07', fetchImpl });
    const rows = await api.dailyOrders(
      'a.myshopify.com',
      'tok',
      { from: '2026-10-21', to: '2026-10-22' },
      'Asia/Ho_Chi_Minh',
    );
    expect(rows).toEqual([
      { date: '2026-10-21', orders: 1, revenue: '100000.5' },
      { date: '2026-10-22', orders: 1, revenue: '300000' },
    ]);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain('/admin/api/2025-07/orders.json?status=any');
  });

  it('lỗi HTTP chỉ mang mã', async () => {
    const fetchImpl = (async () =>
      new Response('{"errors":"token shpat_xxx"}', { status: 401 })) as unknown as typeof fetch;
    const api = new HttpShopify({ clientId: 'c', clientSecret: 's', apiVersion: '2025-07', fetchImpl });
    await expect(api.shopInfo('a.myshopify.com', 'tok')).rejects.toThrow(/^SHOPIFY_HTTP_401$/);
  });
});
