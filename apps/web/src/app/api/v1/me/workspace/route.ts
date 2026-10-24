import { z } from 'zod';
import { AppError } from '@adxlens/core/shared';
import { resolveActor } from '@adxlens/core/tenancy';
import { json, route, WORKSPACE_COOKIE } from '@/server/route';

/** Chọn workspace hiện tại: chỉ đặt cookie khi user là thành viên (mọi request vẫn kiểm lại). */
export const POST = route({
  auth: 'user',
  body: z.object({ workspaceId: z.string().uuid() }),
  handler: async ({ db, user }, { body }) => {
    const actor = await resolveActor(db, body.workspaceId, user.id);
    if (!actor) throw new AppError('FORBIDDEN', 'Không thuộc workspace này');
    const res = json({ workspace_id: body.workspaceId, role: actor.role });
    res.headers.append(
      'set-cookie',
      `${WORKSPACE_COOKIE}=${body.workspaceId}; Path=/; SameSite=Lax; HttpOnly; Max-Age=31536000`,
    );
    return res;
  },
});
