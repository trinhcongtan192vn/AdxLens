import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeTestDb, seedMember, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { recordingEnqueue } from '@adxlens/jobs';
import { MOCK_ACCOUNTS, MockMetaRead } from '@adxlens/meta-client/mock';
import { importAccounts, keysFromEnv, saveConnection } from '@adxlens/core/connections';
import { adsetAudiences, startBackfill, syncRange } from '@adxlens/core/ingestion';
import { resolveActor } from '@adxlens/core/tenancy';
import { entityMetricValues, topAudiences } from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());
const KEYS = keysFromEnv({ TOKEN_ENC_KEY_V1: Buffer.alloc(32, 8).toString('base64') });
const now = () => new Date('2026-10-23T03:00:00Z');
const cur = { from: '2026-10-16', to: '2026-10-22' };

describe('Top Audiences (Madgicx Audience Studio)', () => {
  it('tách audience: lookalike / custom theo loại Meta, interest, không có gì → Rộng', () => {
    const types = new Map([
      ['1', 'LOOKALIKE'],
      ['2', 'WEBSITE'],
    ]);
    expect(
      adsetAudiences(
        {
          custom_audiences: [
            { id: '1', name: 'LAL' },
            { id: '2', name: 'Web' },
          ],
          flexible_spec: [{ interests: [{ id: '9', name: 'Mỹ phẩm' }] }],
        },
        types,
      ),
    ).toEqual([
      { key: 'ca:1', name: 'LAL', type: 'lookalike' },
      { key: 'ca:2', name: 'Web', type: 'custom' },
      { key: 'int:9', name: 'Mỹ phẩm', type: 'interest' },
    ]);
    expect(adsetAudiences(null, null)).toEqual([{ key: 'broad', name: null, type: 'broad' }]);
  });

  it('xếp theo chi tiêu; mỗi audience = tổng nhóm QC dùng nó; buyer không thấy gì', async () => {
    const { workspace, owner } = await seedWorkspace(db);
    const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
    const { connectionId } = await saveConnection(
      ctx,
      { token: 'mock-read-au', expiresAt: null, scopes: ['ads_read'], metaUser: { id: 'au' }, accounts: MOCK_ACCOUNTS },
      KEYS,
    );
    const [a] = await importAccounts(ctx, { connectionId, metaAccountIds: ['act_100000001'] });
    const enqueue = recordingEnqueue();
    await startBackfill(ctx, a!.adAccountId, { enqueue, clock: { now } });
    for (const c of enqueue.calls.slice(0, 2)) {
      await syncRange(ctx, c.payload as never, { meta: new MockMetaRead(now), keys: KEYS.keys });
    }
    const r = await topAudiences(ctx, [a!.adAccountId], cur);
    const types = new Set(r.rows.map((x) => x.type));
    expect([...types].sort()).toEqual(['broad', 'custom', 'interest', 'lookalike']);
    expect(r.rows.map((x) => Number(x.spend))).toEqual([...r.rows.map((x) => Number(x.spend))].sort((p, q) => q - p));
    // "Rộng" = tổng chi các nhóm QC không có audience nào.
    const m = await entityMetricValues(ctx, [a!.adAccountId], 'adset', cur);
    const broad = r.rows.find((x) => x.type === 'broad')!;
    expect(broad.adsets).toBeGreaterThan(0);
    expect(Number(broad.spend)).toBeLessThanOrEqual([...m.values()].reduce((s, v) => s + Number(v.spend ?? 0), 0));

    const buyer = await seedMember(db, workspace.id, 'buyer');
    const bctx = { ...ctx, actor: (await resolveActor(db, workspace.id, buyer.id))! };
    expect((await topAudiences(bctx, [a!.adAccountId], cur)).rows).toEqual([]);
  });
});
