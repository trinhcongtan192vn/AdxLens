import { getEnv } from '@adxlens/config/env';
import { parseSignedRequest } from '@adxlens/core/connections';
import { handleMetaDataDeletion } from '@adxlens/core/ops';
import { AppError } from '@adxlens/core/shared';
import { route } from '@/server/route';

/**
 * L3 10.2 `POST /webhooks/meta`: deauthorize và data deletion callback của Meta (form `signed_request`,
 * HMAC bằng app secret). Thu hồi mọi kết nối của người dùng Meta; trả `{ url, confirmation_code }`.
 */
export const POST = route({
  auth: 'public',
  handler: async (ctx) => {
    const env = getEnv();
    if (!env.META_APP_SECRET) throw new AppError('INTERNAL', 'Thiếu META_APP_SECRET');
    const form = await ctx.req.formData().catch(() => null);
    const sr = form?.get('signed_request');
    if (typeof sr !== 'string') throw new AppError('BAD_REQUEST', 'Thiếu signed_request');
    const { userId } = parseSignedRequest(sr, env.META_APP_SECRET);
    const r = await handleMetaDataDeletion(ctx.db, userId, {
      enqueue: ctx.enqueue,
      email: ctx.email,
      appUrl: env.APP_URL,
    });
    ctx.log.info({ connections: r.connections }, 'meta data deletion callback');
    return { url: `${env.APP_URL}/data-deletion?code=${r.code}`, confirmation_code: r.code };
  },
});
