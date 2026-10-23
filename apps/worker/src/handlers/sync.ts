import { refreshAvailableAccounts } from '@adxlens/core/connections';
import type { HandlerMap } from '../handler';

export const syncHandlers: HandlerMap = {
  // S04: làm mới danh sách tài khoản và chi tiêu 30 ngày sau OAuth.
  'sync:refresh_accounts': async ({ workspaceId, connectionId }, { db, meta, tokenKeys }) =>
    refreshAvailableAccounts({ db, workspaceId }, connectionId, { meta, keys: tokenKeys }),
};
