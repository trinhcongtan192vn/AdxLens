import { and, eq } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import { assignableMembers } from '@adxlens/core/recommendation';
import { AppError } from '@adxlens/core/shared';
import { route, uuidParam } from '@/server/route';

/** Người có thể nhận việc (xem được Client của tài khoản). Sau cờ `p1_recommendations`. */
export const GET = route({
  auth: 'workspace',
  permission: 'recommendations.update',
  flag: 'p1_recommendations',
  handler: async (ctx) => {
    const [rec] = await ctx.db
      .select({ adAccountId: schema.recommendations.adAccountId })
      .from(schema.recommendations)
      .where(
        and(
          eq(schema.recommendations.workspaceId, ctx.workspaceId),
          eq(schema.recommendations.id, uuidParam(ctx, 'id')),
        ),
      );
    if (!rec) throw new AppError('NOT_FOUND', 'Không tìm thấy gợi ý');
    const members = await assignableMembers(ctx, rec.adAccountId);
    return { items: members.map((m) => ({ user_id: m.userId, name: m.name ?? m.email, role: m.role })) };
  },
});
