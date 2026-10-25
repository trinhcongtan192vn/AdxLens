import { safeEqual } from '@adxlens/core/shared';
import { saveStoreConnection, STORE_BACKFILL_DAYS, tiktokTokenPayload } from '@adxlens/core/stores';
import { publicUrl } from '@/lib/public-url';
import { tokenKeys } from '@/server/meta';
import { route } from '@/server/route';
import { verify } from '@/server/signed';
import { tiktok } from '@/server/stores';

const COOKIE = 'tiktok_oauth';

function readCookie(req: Request, name: string): string | undefined {
  return (req.headers.get('cookie') ?? '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))?.[1];
}

function back(req: Request, result: string): Response {
  const res = new Response(null, {
    status: 302,
    headers: { location: publicUrl(`/connections?store=${result}`, req).toString() },
  });
  res.headers.append('set-cookie', `${COOKIE}=; Path=/api/v1/stores/tiktok; Max-Age=0`);
  return res;
}

/**
 * ADR-0029 (TikTok Shop): TikTok chuyển về với `code` + `state`. Kiểm state (cookie ký), đổi code lấy token, đọc các shop
 * được ủy quyền; mỗi shop lưu một kết nối (refresh token + shop cipher, mã hóa) gắn Client đã chọn; xếp đồng bộ 30 ngày.
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
    if (
      !saved ||
      !state ||
      !code ||
      !safeEqual(saved.state, state) ||
      saved.workspaceId !== ctx.workspaceId ||
      saved.userId !== ctx.user.id
    ) {
      return back(ctx.req, 'invalid');
    }
    try {
      const api = tiktok();
      const t = await api.exchangeCode(code);
      const shops = await api.shops(t.accessToken);
      if (!shops.length) return back(ctx.req, 'noaccess');
      for (const s of shops) {
        const { id } = await saveStoreConnection(
          ctx,
          {
            provider: 'tiktok_shop',
            externalId: s.id,
            name: s.name,
            currency: s.currency || null,
            timezone: s.timezone,
            token: tiktokTokenPayload(t.refreshToken, s.cipher),
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
      }
      return back(ctx.req, 'connected');
    } catch {
      return back(ctx.req, 'failed');
    }
  },
});
