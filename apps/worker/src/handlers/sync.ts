import { refreshAvailableAccounts } from '@adxlens/core/connections';
import { runDailySync, syncRange } from '@adxlens/core/ingestion';
import { dueDailySyncs } from '@adxlens/core/ops';
import { dueStoreSyncs, runStoreSync, STORE_DAILY_DAYS } from '@adxlens/core/stores';
import type { HandlerMap } from '../handler';

export const syncHandlers: HandlerMap = {
  // S04: làm mới danh sách tài khoản và chi tiêu 30 ngày sau OAuth.
  'sync:refresh_accounts': async ({ workspaceId, connectionId }, { db, meta, tokenKeys }) =>
    refreshAvailableAccounts({ db, workspaceId }, connectionId, { meta, keys: tokenKeys }),

  // Một lô 7 ngày của backfill 90 ngày (L3 6.3).
  'sync:backfill_account': async (p, { db, meta, tokenKeys, finalAttempt, enqueue }) =>
    syncRange(
      { db, workspaceId: p.workspaceId },
      { syncRunId: p.syncRunId, adAccountId: p.adAccountId, from: p.from, to: p.to, finalAttempt },
      { meta, keys: tokenKeys, enqueue },
    ),

  // Daily sync: 3 ngày gần nhất tới `date`.
  'sync:daily_account': async (p, { db, meta, tokenKeys, finalAttempt, enqueue }) =>
    runDailySync(
      { db, workspaceId: p.workspaceId },
      { adAccountId: p.adAccountId, date: p.date, finalAttempt },
      { meta, keys: tokenKeys, enqueue },
    ),

  // ADR-0029: số liệu cửa hàng / GA4 của một kết nối (token giải mã trong runStoreSync, chỉ ở worker).
  'sync:store_daily': async (p, { db, shopify, ga4, shopee, tiktok, tokenKeys, log }) => {
    const r = await runStoreSync(
      { db, workspaceId: p.workspaceId },
      { connectionId: p.connectionId, days: p.days },
      { shopify, ga4, shopee, tiktok, keys: tokenKeys },
    );
    log.info({ connection_id: p.connectionId, ...r }, 'store sync');
    return r;
  },

  // Scheduler mỗi giờ: enqueue daily sync cho tài khoản đang 03:00 giờ địa phương (+ kết nối cửa hàng, ADR-0029).
  'maintenance:daily_sync_tick': async (p, { db, enqueue, log }) => {
    const now = new Date();
    const due = await dueDailySyncs(db, now);
    for (const d of due) await enqueue('sync:daily_account', d);
    const stores = await dueStoreSyncs(db, now);
    for (const s of stores) {
      await enqueue('sync:store_daily', { ...s, days: STORE_DAILY_DAYS, tick: p.tick });
    }
    if (due.length || stores.length) log.info({ count: due.length, stores: stores.length }, 'đã lên lịch daily sync');
    return { enqueued: due.length, stores: stores.length };
  },
};
