import { z } from 'zod';
import { stopAgentReply } from '@adxlens/core/agent';
import { route, uuidParam } from '@/server/route';

/** Dừng câu trả lời đang sinh (chỉ tin của chính người hỏi, đang chờ). */
export const POST = route({
  auth: 'workspace',
  flag: 'p1_recommendations',
  body: z.object({ messageId: z.string().uuid() }),
  handler: async (ctx, { body }) => {
    await stopAgentReply(ctx, uuidParam(ctx, 'id'), body.messageId);
    return null;
  },
});
