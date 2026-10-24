import { ping } from '@adxlens/db';
import { route } from '@/server/route';

/** Uptime check (L3 mục 12): `GET /api/health`. Không lộ thông tin nội bộ. */
export const GET = route({
  auth: 'public',
  handler: async ({ db }) => {
    await ping(db);
    return { status: 'ok' };
  },
});
