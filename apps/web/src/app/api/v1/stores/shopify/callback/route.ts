import { saveStoreConnection, STORE_BACKFILL_DAYS } from '@adxlens/core/stores';
import { safeEqual } from '@adxlens/core/shared';
import { verifyShopifyHmac } from '@adxlens/store-client';
import { publicUrl } from '@/lib/public-url';
import { tokenKeys } from '@/server/meta';
import { route } from '@/server/route';
import { verify } from '@/server/signed';
import { shopify, shopifyConfig } from '@/server/stores';

const COOKIE = 'shopify_oauth';

function readCookie(req: Request, name: string): string | undefined {
  return (req.headers.get('cookie') ?? '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))?.[1];
}

function back(req: Request, result: string): Response {
  const res = new Response(null, {
    status: 302,
    headers: { location: publicUrl(`/connections?store=${result}`, req).toString() },
  });
  res.headers.append('set-cookie', `${COOKIE}=; Path=/api/v1/stores/shopify; Max-Age=0`);
  return res;
}

/**
 * ADR-0029: Shopify chuyển về sau khi cài app. Kiểm `hmac` (client secret), state (cookie ký, cùng workspace / user /
 * shop), đổi code lấy token, đọc thông tin shop rồi mã hóa token và lưu; xếp đồng bộ 30 ngày. Token rõ chỉ tồn tại trong
 * request này, không log, không trả ra ngoài.
 */
export const GET = route({
  auth: 'workspace',
  permission: 'connections.manage',
  handler: async (ctx) => {
    const url = new URL(ctx.req.url);
    const params = Object.fromEntries(url.searchParams.entries());
    const saved = verify<{ state: string; workspaceId: string; userId: string; shop: string; clientId: string | null }>(
      readCookie(ctx.req, COOKIE),
    );
    const cfg = shopifyConfig();
    if (
      !saved ||
      !params.state ||
      !params.code ||
      !safeEqual(saved.state, params.state) ||
      saved.workspaceId !== ctx.workspaceId ||
      saved.userId !== ctx.user.id ||
      params.shop !== saved.shop ||
      (!cfg.mock && !verifyShopifyHmac(params, cfg.clientSecret ?? ''))
    ) {
      return back(ctx.req, 'invalid');
    }
    try {
      const api = shopify();
      const { token } = await api.exchangeCode(saved.shop, params.code);
      const info = await api.shopInfo(saved.shop, token);
      const { id } = await saveStoreConnection(
        ctx,
        {
          provider: 'shopify',
          externalId: saved.shop,
          name: info.name,
          currency: info.currency,
          timezone: info.timezone,
          token,
          clientId: saved.clientId,
        },
        tokenKeys(),
      );
      await ctx.enqueue('sync:store_daily', {
        workspaceId: ctx.workspaceId,
        connectionId: id,
        days: STORE_BACKFILL_DAYS,
        tick: `connect-${Date.now()}`,
      });
      return back(ctx.req, 'connected');
    } catch {
      return back(ctx.req, 'failed');
    }
  },
});
