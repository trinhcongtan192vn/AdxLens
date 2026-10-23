import type { Db } from '@adxlens/db';
import { keysFromEnv, saveConnection } from '@adxlens/core/connections';
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

export const JOB_PROBES: Record<string, JobProbe> = {
  'sync:refresh_accounts': {
    prepare: realConnectionForA,
    payload: (w, p) => ({ workspaceId: w.a.workspace.id, connectionId: p!.connectionId }),
  },
  // Workspace A nhưng kết nối của B: phải không tìm thấy (lọc theo workspace_id).
  'sync:refresh_accounts#cross': {
    payload: (w) => ({ workspaceId: w.a.workspace.id, connectionId: w.b.connection.id }),
  },
};
