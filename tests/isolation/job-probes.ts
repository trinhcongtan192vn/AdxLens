import type { Db } from '@adxlens/db';
import { importAccounts, keysFromEnv, saveConnection } from '@adxlens/core/connections';
import { startBackfill } from '@adxlens/core/ingestion';
import { recordingEnqueue } from '@adxlens/jobs';
import { resolveActor } from '@adxlens/core/tenancy';
import { MOCK_ACCOUNTS } from '@adxlens/meta-client/mock';
import { TEST_TOKEN_KEY } from '../../apps/worker/src/testing';
import type { World } from './world';

/**
 * Probe cách ly cho job theo workspace: `payload` cho workspace A; test băm dữ liệu B trước và sau
 * khi chạy job, phải không đổi. `prepare` tạo dữ liệu A cần thiết. Khóa có hậu tố "#..." là biến thể
 * của cùng một job.
 */
export type JobProbe = {
  prepare?: (db: Db, w: World) => Promise<Record<string, string>>;
  payload: (w: World, prepared?: Record<string, string>) => unknown;
};

/** Kết nối A với token mã hóa thật (khóa test) để job chạy trọn luồng. */
async function realConnectionForA(db: Db, w: World) {
  const actor = (await resolveActor(db, w.a.workspace.id, w.a.owner.id))!;
  const { connectionId } = await saveConnection(
    { db, workspaceId: w.a.workspace.id, actor },
    {
      token: 'mock-read-probe',
      expiresAt: null,
      scopes: ['ads_read'],
      metaUser: { id: 'meta-alpha' },
      accounts: MOCK_ACCOUNTS,
    },
    keysFromEnv({ TOKEN_ENC_KEY_V1: TEST_TOKEN_KEY }),
  );
  return { connectionId };
}

/** Tài khoản A nhập từ kết nối thật + một lần backfill đã lên lịch (lô đầu). */
async function backfillForA(db: Db, w: World) {
  const { connectionId } = await realConnectionForA(db, w);
  const actor = (await resolveActor(db, w.a.workspace.id, w.a.owner.id))!;
  const ctx = { db, workspaceId: w.a.workspace.id, actor };
  const [a] = await importAccounts(ctx, { connectionId, metaAccountIds: ['act_100000001'] });
  const enqueue = recordingEnqueue();
  const { syncRunId } = await startBackfill(ctx, a!.adAccountId, { enqueue });
  const first = enqueue.calls[0]!.payload as { from: string; to: string };
  return { adAccountId: a!.adAccountId, syncRunId, from: first.from, to: first.to };
}

export const JOB_PROBES: Record<string, JobProbe> = {
  'sync:refresh_accounts': {
    prepare: realConnectionForA,
    payload: (w, p) => ({ workspaceId: w.a.workspace.id, connectionId: p!.connectionId }),
  },
  // Workspace A nhưng kết nối của B: phải không tìm thấy (lọc theo workspace_id).
  'sync:refresh_accounts#cross': {
    payload: (w) => ({ workspaceId: w.a.workspace.id, connectionId: w.b.connection.id }),
  },
  'sync:backfill_account': {
    prepare: backfillForA,
    payload: (w, p) => ({ workspaceId: w.a.workspace.id, ...p }),
  },
  // Lần chạy của A nhưng tài khoản QC của B.
  'sync:backfill_account#cross': {
    prepare: backfillForA,
    payload: (w, p) => ({ workspaceId: w.a.workspace.id, ...p, adAccountId: w.b.adAccount.id }),
  },
  'sync:daily_account': {
    prepare: backfillForA,
    payload: (w, p) => ({ workspaceId: w.a.workspace.id, adAccountId: p!.adAccountId, date: p!.to }),
  },
  'maintenance:purge_connection_data': {
    prepare: async (db, w) => realConnectionForA(db, w),
    payload: (w, p) => ({ workspaceId: w.a.workspace.id, connectionId: p!.connectionId }),
  },
  // Workspace A nhưng kết nối của B: không được xóa gì của B.
  'maintenance:purge_connection_data#cross': {
    payload: (w) => ({ workspaceId: w.a.workspace.id, connectionId: w.b.connection.id }),
  },
  'audit:run': {
    prepare: backfillForA,
    payload: (w, p) => ({ workspaceId: w.a.workspace.id, adAccountId: p!.adAccountId, snapshotVersion: 'probe' }),
  },
  'audit:run#cross': {
    payload: (w) => ({ workspaceId: w.a.workspace.id, adAccountId: w.b.adAccount.id, snapshotVersion: 'probe' }),
  },
  'reconcile:account': {
    prepare: backfillForA,
    payload: (w, p) => ({ workspaceId: w.a.workspace.id, adAccountId: p!.adAccountId, from: p!.from, to: p!.to }),
  },
  'reconcile:account#cross': {
    payload: (w) => ({
      workspaceId: w.a.workspace.id,
      adAccountId: w.b.adAccount.id,
      from: '2026-10-20',
      to: '2026-10-22',
    }),
  },
  'sync:daily_account#cross': {
    payload: (w) => ({ workspaceId: w.a.workspace.id, adAccountId: w.b.adAccount.id, date: '2026-10-22' }),
  },
};
