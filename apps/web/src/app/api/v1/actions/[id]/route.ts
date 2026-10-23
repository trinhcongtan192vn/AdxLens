import { getAction } from '@adxlens/core/execution';
import { actionDto } from '@/server/actions';
import { route, uuidParam } from '@/server/route';

/** P204 Chi tiết hành động + nhật ký. Sau cờ `p2a_approve`. */
export const GET = route({
  auth: 'workspace',
  permission: 'actions.view',
  flag: 'p2a_approve',
  handler: async (ctx) => {
    const a = await getAction(ctx, uuidParam(ctx, 'id'));
    return {
      ...actionDto(a),
      logs: a.logs.map((l) => ({ event: l.event, detail: l.detail, at: l.at })),
      undo_action: a.undoAction,
    };
  },
});
