import { safeEqual } from '@adxlens/core/shared';
import { saveStoreConnection, STORE_BACKFILL_DAYS } from '@adxlens/core/stores';
import { publicUrl } from '@/lib/public-url';
import { tokenKeys } from '@/server/meta';
import { route } from '@/server/route';
import { verify } from '@/server/signed';
import { ga4, ga4RedirectUri } from '@/server/stores';

const COOKIE = 'ga4_oauth';

function readCookie(req: Request, name: string): string | undefined {
  return (req.headers.get('cookie') ?? '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))?.[1];
}

function back(req: Request, result: string): Response {
  const res = new Response(null, {
    status: 302,
    headers: { location: publicUrl(`/connections?store=${result}`, req).toString() },
  });
  res.headers.append('set-cookie', `${COOKIE}=; Path=/api/v1/stores/ga4; Max-Age=0`);
  return res;
}

/**
 * ADR-0029: Google chuyển về sau khi đồng ý. Kiểm state (cookie ký, cùng workspace / user), đổi code lấy refresh token,
 * kiểm quyền đọc property đã nhập (không có quyền → `noaccess`), mã hóa refresh token và lưu; xếp đồng bộ 30 ngày. Token
 * rõ chỉ tồn tại trong request này.
 */
export const GET = route({
  auth: 'workspace',
  permission: 'connections.manage',
  handler: async (ctx) => {
    const q = new URL(ctx.req.url).searchParams;
    if (q.get('error')) return back(ctx.req, 'denied');
    const saved = verify<{
      state: string;
      workspaceId: string;
      userId: string;
      property: string;
      clientId: string | null;
    }>(readCookie(ctx.req, COOKIE));
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
    const api = ga4();
    let tokens: { refreshToken: string; accessToken: string };
    try {
      tokens = await api.exchangeCode(code, ga4RedirectUri(ctx.req));
    } catch {
      return back(ctx.req, 'failed');
    }
    let info: { name: string; currency: string; timezone: string };
    try {
      info = await api.property(tokens.accessToken, saved.property);
    } catch {
      return back(ctx.req, 'noaccess');
    }
    const { id } = await saveStoreConnection(
      ctx,
      {
        provider: 'ga4',
        externalId: saved.property,
        name: info.name,
        currency: info.currency || null,
        timezone: info.timezone,
        token: tokens.refreshToken,
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
  },
});
