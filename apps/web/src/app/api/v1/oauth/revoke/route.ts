import { revokeOAuthToken } from '@adxlens/core/ops';
import { readOAuthParams } from '@/server/oauth';
import { route } from '@/server/route';

/** RFC 7009: thu hồi access / refresh token → thu hồi cả grant. Token lạ vẫn trả 200 (theo RFC). */
export const POST = route({
  auth: 'public',
  handler: async ({ req, db }) => {
    const p = await readOAuthParams(req);
    if (p.token) await revokeOAuthToken(db, p.token);
    return new Response(null, { status: 200 });
  },
});
