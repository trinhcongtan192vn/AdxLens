import { isEnabled } from '@adxlens/core/flags';
import { generateWeeklyActions } from '@adxlens/core/recommendation';
import type { HandlerMap } from '../handler';

export const recommendHandlers: HandlerMap = {
  // Weekly Action List (P1-04). Kiểm cờ ở đầu job (CLAUDE.md quy tắc 7).
  'recommend:build': async (p, { db, enqueue, log }) => {
    const ctx = { db, workspaceId: p.workspaceId };
    if (!(await isEnabled(ctx, 'p1_recommendations'))) return { status: 'flag_off' };
    const r = await generateWeeklyActions(ctx, p.week, { enqueue });
    log.info({ week: p.week, ...r }, 'weekly actions');
    return { status: 'ok', ...r };
  },
};
