import { z } from 'zod';
import { askAgent } from '@adxlens/core/agent';
import { route } from '@/server/route';

/** Hỏi AI agent (ADR-0019): lưu câu hỏi, worker trả lời; giao diện đọc lại hội thoại. Cờ P1 kiểm trong core. */
export const POST = route({
  auth: 'workspace',
  body: z.object({
    threadId: z.string().uuid().nullable().default(null),
    question: z.string().trim().min(1).max(2000),
    adAccountId: z.string().uuid().nullable().optional(),
    period: z.enum(['last7', 'last14', 'last30']).optional(),
    locale: z.enum(['vi', 'en']).optional(),
  }),
  handler: async (ctx, { body }) => askAgent(ctx, body, { enqueue: ctx.enqueue }),
});
