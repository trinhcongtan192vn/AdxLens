import { z } from 'zod';
import { exchangeOAuthCode, saveConnection } from '@adxlens/core/connections';
import { AppError, safeEqual } from '@adxlens/core/shared';
import { metaConfig, metaRead, oauthRedirectUri, tokenKeys } from '@/server/meta';
import { route } from '@/server/route';
import { verify } from '@/server/signed';

const COOKIE = 'meta_oauth';

function readCookie(req: Request, name: string): string | undefined {
  const m = (req.headers.get('cookie') ?? '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m?.[1];
}

function redirect(req: Request, path: string): Response {
  const res = new Response(null, { status: 302, headers: { location: new URL(path, req.url).toString() } });
  res.headers.append('set-cookie', `${COOKIE}=; Path=/api/v1/connections/meta; Max-Age=0`);
  return res;
}

/**
 * Meta chuyển về sau khi người dùng cấp quyền. Kiểm state (cookie ký HMAC, cùng workspace + user),
 * đổi code lấy token dài hạn, đọc danh sách tài khoản QC rồi mã hóa token và lưu. Token rõ chỉ tồn
 * tại trong request này, không log, không trả ra ngoài (CLAUDE.md quy tắc 2).
 */
export const GET = route({
  auth: 'workspace',
  permission: 'connections.manage',
  query: z.object({
    code: z.string().optional(),
    state: z.string().optional(),
    error: z.string().optional(),
  }),
  handler: async (ctx, { query }) => {
    if (query.error) return redirect(ctx.req, '/connections?error=denied');
    const saved = verify<{ state: string; workspaceId: string; userId: string; scope: 'read' }>(
      readCookie(ctx.req, COOKIE),
    );
    if (
      !saved ||
      !query.state ||
      !query.code ||
      !safeEqual(saved.state, query.state) ||
      saved.workspaceId !== ctx.workspaceId ||
      saved.userId !== ctx.user.id
    ) {
      throw new AppError('FORBIDDEN', 'Phiên kết nối không hợp lệ hoặc đã hết hạn');
    }
    try {
      const cfg = metaConfig();
      const exchanged = await exchangeOAuthCode(cfg, {
        code: query.code,
        redirectUri: oauthRedirectUri(),
        scope: saved.scope,
      });
      const meta = metaRead();
      const [me, scopes, accounts] = await Promise.all([
        meta.me(exchanged.token),
        meta.grantedScopes(exchanged.token),
        meta.listAdAccounts(exchanged.token),
      ]);
      if (!scopes.includes('ads_read')) return redirect(ctx.req, '/connections?error=missing_scope');
      const { connectionId } = await saveConnection(
        ctx,
        { token: exchanged.token, expiresAt: exchanged.expiresAt, scopes, metaUser: me, accounts },
        tokenKeys(),
      );
      // Worker tính chi tiêu 30 ngày cho S04 (giải mã token chỉ trong worker).
      await ctx.enqueue('sync:refresh_accounts', { workspaceId: ctx.workspaceId, connectionId });
      return redirect(ctx.req, `/connections/select?connection=${connectionId}`);
    } catch (e) {
      // Lỗi đã được che token trong meta-client; chỉ log tên và mã.
      ctx.log.error({ err: e }, 'kết nối Meta thất bại');
      return redirect(ctx.req, '/connections?error=failed');
    }
  },
});
