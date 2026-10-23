import { refreshAvailableAccounts } from '@adxlens/core/connections';
import { runDailySync, syncRange } from '@adxlens/core/ingestion';
import { dueDailySyncs } from '@adxlens/core/ops';
import type { HandlerMap } from '../handler';

export const syncHandlers: HandlerMap = {
  // S04: làm mới danh sách tài khoản và chi tiêu 30 ngày sau OAuth.
  'sync:refresh_accounts': async ({ workspaceId, connectionId }, { db, meta, tokenKeys }) =>
    refreshAvailableAccounts({ db, workspaceId }, connectionId, { meta, keys: tokenKeys }),

  // Một lô 7 ngày của backfill 90 ngày (L3 6.3).
  'sync:backfill_account': async (p, { db, meta, tokenKeys, finalAttempt }) =>
    syncRange(
      { db, workspaceId: p.workspaceId },
      { syncRunId: p.syncRunId, adAccountId: p.adAccountId, from: p.from, to: p.to, finalAttempt },
      { meta, keys: tokenKeys },
    ),

  // Daily sync: 3 ngày gần nhất tới `date`.
  'sync:daily_account': async (p, { db, meta, tokenKeys, finalAttempt }) =>
    runDailySync(
      { db, workspaceId: p.workspaceId },
      { adAccountId: p.adAccountId, date: p.date, finalAttempt },
      { meta, keys: tokenKeys },
    ),

  // Scheduler mỗi giờ: enqueue daily sync cho tài khoản đang 03:00 giờ địa phương.
  'maintenance:daily_sync_tick': async (_p, { db, enqueue, log }) => {
    const due = await dueDailySyncs(db, new Date());
    for (const d of due) await enqueue('sync:daily_account', d);
    if (due.length) log.info({ count: due.length }, 'đã lên lịch daily sync');
    return { enqueued: due.length };
  },
};
