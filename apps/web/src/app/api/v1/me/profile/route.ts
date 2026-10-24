import { z } from 'zod';
import { updateProfile } from '@adxlens/core/tenancy';
import { LOCALE_COOKIE } from '@/i18n/locale';
import { json, route } from '@/server/route';

/** ST06 Hồ sơ cá nhân: họ tên, ngôn ngữ giao diện. */
export const PATCH = route({
  auth: 'user',
  body: z.object({
    fullName: z.string().trim().min(1).max(120).optional(),
    locale: z.enum(['vi', 'en']).optional(),
  }),
  handler: async ({ db, user }, { body }) => {
    await updateProfile(db, user.id, body);
    const res = json({ ok: true });
    if (body.locale)
      res.headers.append('set-cookie', `${LOCALE_COOKIE}=${body.locale}; Path=/; SameSite=Lax; Max-Age=31536000`);
    return res;
  },
});
