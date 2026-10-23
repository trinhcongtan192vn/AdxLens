import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@adxlens/db';
import {
  closeTestDb,
  seedAdAccount,
  seedClient,
  seedConnection,
  seedMember,
  seedWorkspace,
  testDb,
  truncateAll,
} from '@adxlens/db/testing';
import { asUser, call, installTestServer, uninstallTestServer } from '../../../../test-utils';
import * as recon from './[id]/reconciliation/route';
import * as resync from './[id]/resync/route';
import * as syncStatus from './[id]/sync-status/route';

const db = testDb();
let server: ReturnType<typeof installTestServer>;
beforeEach(async () => {
  await truncateAll(db);
  server = installTestServer(db);
});
afterEach(() => uninstallTestServer());
afterAll(() => closeTestDb());

async function setup() {
  const { workspace, owner } = await seedWorkspace(db);
  const client = await seedClient(db, workspace.id, 'Linh');
  const conn = await seedConnection(db, workspace.id, owner.id);
  const acc = await seedAdAccount(db, workspace.id, conn.id, { clientId: client.id, confirmed: true });
  const row = (date: string, spendMeta: string, status: 'ok' | 'warning', pct: string) => ({
    workspaceId: workspace.id,
    adAccountId: acc.id,
    date,
    spendInternal: '1000000.0000',
    spendMeta,
    resultsInternal: 10,
    resultsMeta: 10,
    resultsByType: { lead: { internal: 10, meta: 10, delta_pct: '0.000000' } },
    resultTypes: ['lead'],
    spendDeltaPct: pct,
    resultsDeltaPct: '0',
    status,
  });
  await db
    .insert(schema.reconciliationResults)
    .values([row('2026-10-20', '986000.0000', 'warning', '1.419878'), row('2026-10-21', '1000000.0000', 'ok', '0')]);
  return { ws: workspace.id, u: asUser(owner), acc, client };
}

describe('API đối chiếu (D04)', () => {
  it('tổng theo chỉ số, ngày lệch, kết quả theo loại', async () => {
    const { ws, u, acc } = await setup();
    const r = await call(recon.GET, {
      user: u,
      workspaceId: ws,
      params: { id: acc.id },
      path: `/api/v1/ad-accounts/${acc.id}/reconciliation?from=2026-10-16&to=2026-10-22`,
    });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'warning', warning_dates: ['2026-10-20'] });
    const metrics = (r.body as { metrics: { key: string; adxlens: string; ads_manager: string; ok: boolean }[] })
      .metrics;
    expect(metrics.find((m) => m.key === 'spend')).toMatchObject({
      adxlens: '2000000.0000',
      ads_manager: '1986000.0000',
      ok: true,
    });
    expect(metrics.find((m) => m.key === 'result:lead')).toMatchObject({ adxlens: '20', ads_manager: '20' });
  });

  it('khoảng ngày sai → 422', async () => {
    const { ws, u, acc } = await setup();
    const r = await call(recon.GET, {
      user: u,
      workspaceId: ws,
      params: { id: acc.id },
      path: `/api/v1/ad-accounts/${acc.id}/reconciliation?from=2026-10-22&to=2026-10-01`,
    });
    expect(r.status).toBe(422);
  });

  it('sync-status có đối chiếu', async () => {
    const { ws, u, acc } = await setup();
    const r = await call(syncStatus.GET, { user: u, workspaceId: ws, params: { id: acc.id } });
    expect((r.body as { reconciliation: { status: string } }).reconciliation.status).toMatch(/ok|warning|pending/);
  });

  it('chạy lại đồng bộ: lên lịch lần chạy manual theo lô; buyer không được', async () => {
    const { ws, u, acc, client } = await setup();
    const r = await call(resync.POST, {
      user: u,
      workspaceId: ws,
      params: { id: acc.id },
      body: { from: '2026-10-01', to: '2026-10-14' },
    });
    expect(r.status).toBe(200);
    const jobs = server.enqueue.calls.filter((c) => c.name === 'sync:backfill_account');
    expect(jobs.map((j) => j.payload)).toEqual([
      expect.objectContaining({ from: '2026-10-08', to: '2026-10-14' }),
      expect.objectContaining({ from: '2026-10-01', to: '2026-10-07' }),
    ]);
    const buyer = asUser(await seedMember(db, ws, 'buyer', [client.id]));
    const denied = await call(resync.POST, {
      user: buyer,
      workspaceId: ws,
      params: { id: acc.id },
      body: { from: '2026-10-01', to: '2026-10-14' },
    });
    expect(denied.status).toBe(403);
  });

  it('khoảng quá 90 ngày → 422', async () => {
    const { ws, u, acc } = await setup();
    const r = await call(resync.POST, {
      user: u,
      workspaceId: ws,
      params: { id: acc.id },
      body: { from: '2026-01-01', to: '2026-10-14' },
    });
    expect(r.status).toBe(422);
  });
});
