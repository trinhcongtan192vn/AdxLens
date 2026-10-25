import { z } from 'zod';
import { findBusinessLinkByToken } from '@adxlens/core/ops';
import { verifySharePassword } from '@adxlens/core/reporting';
import { AppError } from '@adxlens/core/shared';
import { route } from '@/server/route';
import { shareUnlockCookie } from '@/server/share-cookie';
import { sign } from '@/server/signed';

/** ADR-0028: nhập mật khẩu link Business → cookie ký 12 giờ cho đúng link. Sai mật khẩu → 403. */
export const POST = route({
  auth: 'public',
  body: z.object({ password: z.string().min(1).max(128) }),
  handler: async (ctx, { body }) => {
    const link = await findBusinessLinkByToken(ctx.db, ctx.params.token ?? '');
    if (!link || !link.passwordHash || link.revokedAt) throw new AppError('NOT_FOUND', 'Không tìm thấy');
    if (!verifySharePassword(body.password, link.passwordHash)) throw new AppError('FORBIDDEN', 'Mật khẩu không đúng');
    const res = Response.json({ ok: true });
    res.headers.append(
      'set-cookie',
      `${shareUnlockCookie(link.id)}=${sign({ link: link.id }, 12 * 3600)}; Path=/b/; HttpOnly; SameSite=Lax; Max-Age=${12 * 3600}${process.env.APP_ENV === 'local' || process.env.APP_ENV === 'test' ? '' : '; Secure'}`,
    );
    return res;
  },
});
