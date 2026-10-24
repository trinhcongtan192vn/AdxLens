import { z } from 'zod';
import { createAuthorizationCode, oauthScopes } from '@adxlens/core/agent';
import { getOAuthClient } from '@adxlens/core/ops';
import { AppError } from '@adxlens/core/shared';
import { route } from '@/server/route';

/**
 * Quyết định ở trang cấp quyền (ADR-0022 B): người dùng đã đăng nhập bấm Cho phép / Từ chối cho workspace hiện tại.
 * Trả URL chuyển về ứng dụng (mã cấp quyền hoặc `access_denied`). Client và redirect_uri kiểm lại ở đây, không tin trang.
 */
export const POST = route({
  auth: 'workspace',
  flag: 'p1_recommendations',
  body: z.object({
    client_id: z.string().max(100),
    redirect_uri: z.string().max(2000),
    code_challenge: z.string().max(200),
    code_challenge_method: z.literal('S256'),
    scope: z.string().max(200).optional(),
    state: z.string().max(1000).optional(),
    decision: z.enum(['allow', 'deny']),
  }),
  handler: async (ctx, { body }) => {
    const client = await getOAuthClient(ctx.db, body.client_id);
    if (!client || !client.redirectUris.includes(body.redirect_uri)) {
      throw new AppError('VALIDATION_FAILED', 'Ứng dụng hoặc redirect_uri không hợp lệ');
    }
    const url = new URL(body.redirect_uri);
    if (body.decision === 'deny') {
      url.searchParams.set('error', 'access_denied');
    } else {
      const code = await createAuthorizationCode(ctx, {
        clientId: client.id,
        clientName: client.name,
        redirectUri: body.redirect_uri,
        codeChallenge: body.code_challenge,
        scopes: oauthScopes(body.scope),
      });
      url.searchParams.set('code', code);
    }
    if (body.state) url.searchParams.set('state', body.state);
    return { redirect: url.toString() };
  },
});
