import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeTestDb, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { MetaApiError, type MetaReadApi } from '@adxlens/meta-client';
import { MOCK_ACCOUNTS, MockMetaRead } from '@adxlens/meta-client/mock';
import { resolveActor } from '@adxlens/core/tenancy';
import { keysFromEnv, listAvailableAccounts, listConnections, refreshAvailableAccounts, saveConnection } from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());
const KEYS = keysFromEnv({ TOKEN_ENC_KEY_V1: Buffer.alloc(32, 3).toString('base64') });
const now = () => new Date('2026-10-23T05:00:00Z');

async function setup() {
  const { workspace, owner } = await seedWorkspace(db);
  const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
  const { connectionId } = await saveConnection(
    ctx,
    { token: 'mock-read-1', expiresAt: null, scopes: ['ads_read'], metaUser: { id: 'm1' }, accounts: MOCK_ACCOUNTS },
    KEYS,
  );
  return { ctx, connectionId };
}

describe('làm mới tài khoản và chi tiêu 30 ngày (S04)', () => {
  it('tính chi tiêu 30 ngày tới hôm qua theo múi giờ tài khoản, lưu numeric', async () => {
    const { ctx, connectionId } = await setup();
    const r = await refreshAvailableAccounts(ctx, connectionId, {
      meta: new MockMetaRead(now),
      keys: KEYS.keys,
      clock: { now },
    });
    expect(r).toEqual({ accounts: 4, status: 'ok' });
    const avail = await listAvailableAccounts(ctx, connectionId);
    expect(avail.every((a) => a.spendChecked && Number(a.spend30d) > 0)).toBe(true);
    // Đối chiếu với tổng thủ công từ mock.
    const rows = await new MockMetaRead(now).getInsights('', 'act_100000001', {
      level: 'account',
      since: '2026-09-23',
      until: '2026-10-22',
    });
    const expected = rows.reduce((t, x) => t + Number(x.spend), 0);
    const got = avail.find((a) => a.metaAccountId === 'act_100000001')!.spend30d;
    expect(Number(got)).toBe(expected);
  });

  it('token bị Meta thu hồi (190) → kết nối chuyển "hết hạn"', async () => {
    const { ctx, connectionId } = await setup();
    class RevokedMeta extends MockMetaRead {
      override async listAdAccounts(): Promise<never> {
        throw new MetaApiError(400, 190, null, 'OAuthException', 'expired', null);
      }
    }
    const broken: MetaReadApi = new RevokedMeta(now);
    const r = await refreshAvailableAccounts(ctx, connectionId, { meta: broken, keys: KEYS.keys });
    expect(r.status).toBe('expired');
    expect((await listConnections(ctx))[0]!.status).toBe('expired');
  });

  it('cột spend_30d là numeric (không float)', async () => {
    const cols = await db.execute<{ data_type: string }>(sql`
      select data_type from information_schema.columns
      where table_schema = 'app' and table_name = 'meta_available_accounts' and column_name = 'spend_30d'`);
    expect(cols[0]!.data_type).toBe('numeric');
  });
});
