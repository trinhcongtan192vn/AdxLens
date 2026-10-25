import { reconcileAccount } from '@adxlens/core/reconciliation';
import type { HandlerMap } from '../handler';

export const reconcileHandlers: HandlerMap = {
  // Đối chiếu sau mỗi lần đồng bộ xong (L3 7.3); lệch → sự cố + playbook reconcile_retry.
  'reconcile:account': async (p, { db, meta, tokenKeys, enqueue }) =>
    reconcileAccount(
      { db, workspaceId: p.workspaceId },
      { adAccountId: p.adAccountId, from: p.from, to: p.to },
      { meta, keys: tokenKeys, enqueue },
    ),
};
