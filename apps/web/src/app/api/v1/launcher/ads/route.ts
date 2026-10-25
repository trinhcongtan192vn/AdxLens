import { z } from 'zod';
import { requestLaunch } from '@adxlens/core/execution';
import { route } from '@/server/route';

/**
 * Ad Launcher (ADR-0023): tạo quảng cáo từ 1–5 creative có sẵn vào một nhóm QC. Mỗi creative = một hành động duyệt
 * tay qua Execution Gateway; quảng cáo mới luôn PAUSED. Sau cờ P2a.
 */
export const POST = route({
  auth: 'workspace',
  flag: 'p2a_approve',
  body: z.object({
    adAccountId: z.string().uuid(),
    adsetId: z.string().regex(/^\d{1,30}$/),
    creativeIds: z
      .array(z.string().regex(/^\d{1,30}$/))
      .min(1)
      .max(5),
    name: z.string().trim().min(1).max(150),
  }),
  handler: async (ctx, { body }) => {
    const ids: string[] = [];
    for (const [i, creativeId] of body.creativeIds.entries()) {
      const a = await requestLaunch(
        ctx,
        {
          kind: 'create_ad',
          adAccountId: body.adAccountId,
          adsetId: body.adsetId,
          creativeId,
          name: body.creativeIds.length > 1 ? `${body.name} #${i + 1}` : body.name,
        },
        { enqueue: ctx.enqueue },
      );
      ids.push(a.id);
    }
    return { action_ids: ids };
  },
});
