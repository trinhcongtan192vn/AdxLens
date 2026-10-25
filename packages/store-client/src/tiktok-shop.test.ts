import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { HttpTiktokShop, tiktokAuthorizeUrl, tiktokSign } from './index';

describe('TikTok Shop Open API (ADR-0029)', () => {
  it('chữ ký: secret + path + tham số đã sắp (bỏ sign / access_token) + body + secret', () => {
    const base = 'sec/order/202309/orders/searchapp_keyakpage_size100shop_cipherCtimestamp1700000000{"a":1}sec';
    expect(
      tiktokSign('sec', {
        path: '/order/202309/orders/search',
        query: {
          timestamp: '1700000000',
          app_key: 'ak',
          shop_cipher: 'C',
          page_size: '100',
          access_token: 'x',
          sign: 'y',
        },
        body: '{"a":1}',
      }),
    ).toBe(createHmac('sha256', 'sec').update(base).digest('hex'));
    expect(tiktokAuthorizeUrl({ serviceId: '7123', state: 's' })).toBe(
      'https://services.tiktokshop.com/open/authorize?service_id=7123&state=s',
    );
  });

  it('đơn theo ngày: phân trang page_token, bỏ đơn hủy, ngày theo múi giờ vùng; lỗi token → 401', async () => {
    const seen: string[] = [];
    const fetchImpl = (async (url: URL, init: RequestInit) => {
      seen.push(url.searchParams.get('page_token') ?? '');
      expect((init.headers as Record<string, string>)['x-tts-access-token']).toBe('tok');
      expect(url.searchParams.get('sign')).toMatch(/^[0-9a-f]{64}$/);
      const second = url.searchParams.get('page_token') === 'p2';
      return new Response(
        JSON.stringify({
          code: 0,
          data: second
            ? {
                orders: [
                  {
                    status: 'COMPLETED',
                    create_time: Date.UTC(2026, 9, 22, 5) / 1000,
                    payment: { total_amount: '200000' },
                  },
                ],
              }
            : {
                next_page_token: 'p2',
                orders: [
                  {
                    status: 'AWAITING_SHIPMENT',
                    create_time: Date.UTC(2026, 9, 21, 18) / 1000,
                    payment: { total_amount: '99000.5' },
                  },
                  {
                    status: 'CANCELLED',
                    create_time: Date.UTC(2026, 9, 22, 2) / 1000,
                    payment: { total_amount: '50000' },
                  },
                ],
              },
        }),
      );
    }) as unknown as typeof fetch;
    const api = new HttpTiktokShop({ appKey: 'ak', appSecret: 'sec', fetchImpl });
    expect(await api.dailyOrders('tok', 'C', { from: '2026-10-22', to: '2026-10-22' }, 'Asia/Ho_Chi_Minh')).toEqual([
      { date: '2026-10-22', orders: 2, revenue: '299000.5' },
    ]);
    expect(seen).toEqual(['', 'p2']);

    const expired = (async () =>
      new Response(JSON.stringify({ code: 105002, message: 'token expired' }))) as unknown as typeof fetch;
    await expect(
      new HttpTiktokShop({ appKey: 'ak', appSecret: 'sec', fetchImpl: expired }).shops('tok'),
    ).rejects.toThrow('TIKTOK_HTTP_401');
  });
});
