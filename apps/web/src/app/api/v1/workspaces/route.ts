import { z } from 'zod';
import { assertCanCreateWorkspace } from '@adxlens/core/billing';
import { createWorkspace, upsertUser } from '@adxlens/core/tenancy';
import { canonicalTimeZone, isValidTimeZone } from '@/lib/timezone';
import { json, route, WORKSPACE_COOKIE } from '@/server/route';

/** A07 Tạo workspace: người tạo thành owner; đặt workspace hiện tại. Giới hạn số workspace Free mỗi user sở hữu. */
export const POST = route({
  auth: 'user',
  body: z.object({
    name: z.string().trim().min(1).max(120),
    timezone: z.string().refine(isValidTimeZone, 'timezone').transform(canonicalTimeZone),
    currency: z.string().regex(/^[A-Z]{3}$/),
    locale: z.enum(['vi', 'en']).default('vi'),
  }),
  handler: async ({ db, user }, { body }) => {
    await upsertUser(db, { id: user.id, email: user.email });
    await assertCanCreateWorkspace(db, user.id);
    const ws = await createWorkspace(db, {
      name: body.name,
      ownerUserId: user.id,
      timezone: body.timezone,
      currency: body.currency,
      locale: body.locale,
    });
    const res = json({ id: ws.id, name: ws.name }, 201);
    res.headers.append('set-cookie', `${WORKSPACE_COOKIE}=${ws.id}; Path=/; SameSite=Lax; HttpOnly; Max-Age=31536000`);
    return res;
  },
});
