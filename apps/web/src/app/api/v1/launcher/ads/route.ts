import { z } from 'zod';
import { requestLaunch } from '@adxlens/core/execution';
import { isAppError } from '@adxlens/core/shared';
import { route } from '@/server/route';

/**
 * Ad Launcher (ADR-0023): tạo quảng cáo từ creative có sẵn vào 1–5 nhóm QC, tối đa 10 cặp (nhóm QC × creative) mỗi lần.
 * Mỗi cặp = một hành động duyệt tay qua Execution Gateway; quảng cáo mới luôn PAUSED. Bị chặn giữa chừng (vd. hết
 * hạn mức hành động hôm nay) → dừng, trả các hành động đã tạo + lý do. Sau cờ P2a.
 */
export const POST = route({
  auth: 'workspace',
  flag: 'p2a_approve',
  body: z
    .object({
      adAccountId: z.string().uuid(),
      adsetIds: z
        .array(z.string().regex(/^\d{1,30}$/))
        .min(1)
        .max(5),
      creativeIds: z
        .array(z.string().regex(/^\d{1,30}$/))
        .min(1)
        .max(5),
      name: z.string().trim().min(1).max(150),
    })
    .refine((b) => b.adsetIds.length * b.creativeIds.length <= 10, { message: 'Tối đa 10 quảng cáo mỗi lần' }),
  handler: async (ctx, { body }) => {
    const ids: string[] = [];
    const total = body.adsetIds.length * body.creativeIds.length;
    let n = 0;
    for (const adsetId of body.adsetIds) {
      for (const creativeId of body.creativeIds) {
        n++;
        try {
          const a = await requestLaunch(
            ctx,
            {
              kind: 'create_ad',
              adAccountId: body.adAccountId,
              adsetId,
              creativeId,
              name: total > 1 ? `${body.name} #${n}` : body.name,
            },
            { enqueue: ctx.enqueue },
          );
          ids.push(a.id);
        } catch (e) {
          // Chưa tạo được cái nào → trả lỗi như thường; đã tạo một phần → báo dừng giữa chừng.
          if (!ids.length || !isAppError(e)) throw e;
          return { action_ids: ids, stopped: e.code };
        }
      }
    }
    return { action_ids: ids };
  },
});
