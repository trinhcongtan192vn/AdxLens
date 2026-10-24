import { z } from 'zod';
import { BULK_APPROVE_LIMIT, requestManualActions } from '@adxlens/core/execution';
import { manualActionSchema, toActionRequest } from '@/server/manual-action';
import { route } from '@/server/route';

/**
 * G4: tạm dừng / bật lại / đổi ngân sách từ bảng chiến dịch (1–20 đối tượng). Mỗi cái qua Execution Gateway đủ lớp an
 * toàn; kết quả từng cái. Sau cờ `p2a_approve`.
 */
export const POST = route({
  auth: 'workspace',
  permission: 'actions.view',
  flag: 'p2a_approve',
  body: z.object({ items: z.array(manualActionSchema).min(1).max(BULK_APPROVE_LIMIT) }),
  handler: async (ctx, { body }) => {
    const results = await requestManualActions(ctx, body.items.map(toActionRequest), { enqueue: ctx.enqueue });
    return Response.json(
      {
        requested: results.filter((r) => r.ok).length,
        items: results.map((r) =>
          r.ok
            ? { key: r.id, ok: true, action_id: r.actionId }
            : { key: r.id, ok: false, code: r.code, message: r.message },
        ),
      },
      { status: 202 },
    );
  },
});
