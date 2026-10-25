import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { HttpShopee, shopeeAuthorizeUrl, shopeeSign } from './index';

describe('Shopee Open Platform (ADR-0029)', () => {
  it('chữ ký: partner_id + path + timestamp [+ access_token + shop_id], HMAC-SHA256 hex', () => {
    const expected = createHmac('sha256', 'key').update('1001/api/v2/shop/get_shop_info1700000000tok55').digest('hex');
    expect(
      shopeeSign('key', {
        partnerId: '1001',
        path: '/api/v2/shop/get_shop_info',
        timestamp: 1700000000,
        accessToken: 'tok',
        shopId: '55',
      }),
    ).toBe(expected);
    const u = new URL(
      shopeeAuthorizeUrl({
        host: 'https://partner.shopeemobile.com',
        partnerId: '1001',
        partnerKey: 'key',
        redirect: 'https://x/cb?state=s',
        timestamp: 1700000000,
      }),
    );
    expect(u.pathname).toBe('/api/v2/shop/auth_partner');
    expect(u.searchParams.get('redirect')).toBe('https://x/cb?state=s');
    expect(u.searchParams.get('sign')).toBe(
      createHmac('sha256', 'key').update('1001/api/v2/shop/auth_partner1700000000').digest('hex'),
    );
  });

  it('đơn theo ngày: danh sách theo cửa sổ + chi tiết theo lô; bỏ đơn hủy; ngày theo múi giờ vùng; lỗi token → mã 401', async () => {
    const paths: string[] = [];
    const fetchImpl = (async (url: URL) => {
      paths.push(url.pathname);
      if (url.pathname.endsWith('get_order_list')) {
        return new Response(
          JSON.stringify({
            error: '',
            response: { more: false, order_list: [{ order_sn: 'A' }, { order_sn: 'B' }, { order_sn: 'C' }] },
          }),
        );
      }
      return new Response(
        JSON.stringify({
          error: '',
          response: {
            order_list: [
              // 2026-10-21 18:00 UTC = 22/10 01:00 giờ VN.
              {
                order_sn: 'A',
                order_status: 'COMPLETED',
                create_time: Date.UTC(2026, 9, 21, 18) / 1000,
                total_amount: 150000.5,
              },
              {
                order_sn: 'B',
                order_status: 'CANCELLED',
                create_time: Date.UTC(2026, 9, 22, 3) / 1000,
                total_amount: 99000,
              },
              {
                order_sn: 'C',
                order_status: 'SHIPPED',
                create_time: Date.UTC(2026, 9, 22, 3) / 1000,
                total_amount: '200000',
              },
            ],
          },
        }),
      );
    }) as unknown as typeof fetch;
    const api = new HttpShopee({
      host: 'https://partner.shopeemobile.com',
      partnerId: '1',
      partnerKey: 'k',
      fetchImpl,
    });
    expect(await api.dailyOrders('tok', '55', { from: '2026-10-22', to: '2026-10-22' }, 'Asia/Ho_Chi_Minh')).toEqual([
      { date: '2026-10-22', orders: 2, revenue: '350000.5' },
    ]);
    expect(paths).toContain('/api/v2/order/get_order_detail');

    const expired = (async () =>
      new Response(JSON.stringify({ error: 'invalid_acceess_token' }))) as unknown as typeof fetch;
    const bad = new HttpShopee({
      host: 'https://partner.shopeemobile.com',
      partnerId: '1',
      partnerKey: 'k',
      fetchImpl: expired,
    });
    await expect(bad.shopInfo('tok', '55')).rejects.toThrow('SHOPEE_HTTP_401');
  });
});
