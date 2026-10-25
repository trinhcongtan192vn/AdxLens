import { safeEqual } from '@adxlens/core/shared';
import { saveStoreConnection, STORE_BACKFILL_DAYS } from '@adxlens/core/stores';
import { publicUrl } from '@/lib/public-url';
import { tokenKeys } from '@/server/meta';
import { route } from '@/server/route';
import { verify } from '@/server/signed';
import { shopee } from '@/server/stores';

const COOKIE = 'shopee_oauth';

function readCookie(req: Request, name: string): string | undefined {
  return (req.headers.get('cookie') ?? '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))?.[1];
}

function back(req: Request, result: string): Response {
  const res = new Response(null, {
    status: 302,
    headers: { location: publicUrl(`/connections?store=${result}`, req).toString() },
  });
  res.headers.append('set-cookie', `${COOKIE}=; Path=/api/v1/stores/shopee; Max-Age=0`);
  return res;
}

/**
 * ADR-0029 (Shopee): Shopee chuyển về với `code` + `shop_id`. Kiểm state (cookie ký), đổi code lấy token, đọc shop (vùng
 * → tiền tệ, múi giờ), mã hóa refresh token và lưu; xếp đồng bộ 30 ngày. Token rõ chỉ tồn tại trong request này.
 */
export const GET = route({
  auth: 'workspace',
  permission: 'connections.manage',
  handler: async (ctx) => {
    const q = new URL(ctx.req.url).searchParams;
    const saved = verify<{ state: string; workspaceId: string; userId: string; clientId: string | null }>(
      readCookie(ctx.req, COOKIE),
    );
    const state = q.get('state');
    const code = q.get('code');
    const shopId = q.get('shop_id');
    if (
      !saved ||
      !state ||
      !code ||
      !shopId ||
      !/^\d{1,20}$/.test(shopId) ||
      !safeEqual(saved.state, state) ||
      saved.workspaceId !== ctx.workspaceId ||
      saved.userId !== ctx.user.id
    ) {
      return back(ctx.req, 'invalid');
    }
    try {
      const api = shopee();
      const t = await api.exchangeCode(code, shopId);
      const info = await api.shopInfo(t.accessToken, shopId);
      const { id } = await saveStoreConnection(
        ctx,
        {
          provider: 'shopee',
          externalId: shopId,
          name: info.name,
          currency: info.currency || null,
          timezone: info.timezone,
          token: t.refreshToken,
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
