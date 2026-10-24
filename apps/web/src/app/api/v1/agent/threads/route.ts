import { listThreads } from '@adxlens/core/agent';
import { route } from '@/server/route';

/** Hội thoại AI agent của người dùng trong workspace (yêu thích trước). */
export const GET = route({
  auth: 'workspace',
  handler: async (ctx) => ({
    items: (await listThreads(ctx)).map((t) => ({
      id: t.id,
      title: t.title,
      favorite: t.favorite,
      updated_at: t.updatedAt.toISOString(),
    })),
  }),
});
