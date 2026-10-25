import { z } from 'zod';
import { requestAiImage } from '@adxlens/core/agent';
import { route } from '@/server/route';

/**
 * ADR-0027: AI tạo ảnh cho creative bằng khóa OpenAI của workspace — tạo bản nháp `generating` và job worker (khóa chỉ
 * giải mã trong worker). Sau cờ P2a. Không có khóa OpenAI → 409.
 */
export const POST = route({
  auth: 'workspace',
  flag: 'p2a_approve',
  body: z.object({ adAccountId: z.string().uuid(), prompt: z.string().trim().min(5).max(1000) }),
  handler: async (ctx, { body }) => {
    const d = await requestAiImage(ctx, body, { enqueue: ctx.enqueue });
    return { id: d.id };
  },
});
