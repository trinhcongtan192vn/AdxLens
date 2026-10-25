import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@adxlens/db';
import { enableFlag } from '@adxlens/core/flags';
import {
  closeTestDb,
  seedAdAccount,
  seedConnection,
  seedStaff,
  seedWorkspace,
  testDb,
  truncateAll,
} from '@adxlens/db/testing';
import { asUser, call, installTestServer, uninstallTestServer } from '../../../../test-utils';
import * as compareRoute from './compare/route';
import * as route from './route';

const db = testDb();
beforeEach(async () => {
  await truncateAll(db);
  installTestServer(db);
});
afterEach(() => uninstallTestServer());
afterAll(() => closeTestDb());

async function setup(flagOn: boolean) {
  const { workspace, owner } = await seedWorkspace(db);
  const conn = await seedConnection(db, workspace.id, owner.id);
  const acc = await seedAdAccount(db, workspace.id, conn.id);
  for (const id of ['c1', 'c2']) {
    await db.insert(schema.entities).values([
      { workspaceId: workspace.id, adAccountId: acc.id, entityType: 'creative', metaId: id, name: `Creative ${id}` },
      {
        workspaceId: workspace.id,
        adAccountId: acc.id,
        entityType: 'ad',
        metaId: `${id}-ad`,
        name: 'Ad',
        attrs: { creative_id: id },
      },
    ]);
    await db.insert(schema.insightsDaily).values({
      workspaceId: workspace.id,
      adAccountId: acc.id,
      entityType: 'ad',
      metaId: `${id}-ad`,
      date: '2026-10-20',
      spend: '50000',
      impressions: 2000,
      linkClicks: 30,
      results: 2,
      resultType: 'lead',
      attributionWindow: '7d_click_1d_view',
    });
  }
  if (flagOn) {
    const pm = await seedStaff(db, true);
    for (const key of ['p0_reports', 'p1_recommendations'] as const) {
      await enableFlag(db, {
        workspaceId: workspace.id,
        key,
        staffUserId: pm.id,
        reason: 'test P1 creative',
        override: true,
      });
    }
  }
  return { ws: workspace.id, user: asUser(owner), acc: acc.id };
}

const q = (acc: string) => `/api/test?account_id=${acc}&from=2026-10-09&to=2026-10-22`;

describe('API creative (P103/P104)', () => {
  it('cờ p1_recommendations tắt thì không chạy (404)', async () => {
    const { ws, user, acc } = await setup(false);
    expect((await call(route.GET, { user, workspaceId: ws, path: q(acc) })).status).toBe(404);
    expect((await call(compareRoute.GET, { user, workspaceId: ws, path: `${q(acc)}&ids=c1,c2` })).status).toBe(404);
  });

  it('cờ bật: danh sách creative gom theo creative gốc; so sánh 2 creative', async () => {
    const { ws, user, acc } = await setup(true);
    const r = await call(route.GET, { user, workspaceId: ws, path: q(acc) });
    expect(r.status).toBe(200);
    const items = (r.body as { items: { creative_id: string; class: string }[] }).items;
    expect(items.map((i) => i.creative_id).sort()).toEqual(['c1', 'c2']);
    const c = await call(compareRoute.GET, { user, workspaceId: ws, path: `${q(acc)}&ids=c1,c2` });
    expect(c.status).toBe(200);
    expect((c.body as { series: unknown[] }).series).toHaveLength(2);
    const bad = await call(compareRoute.GET, { user, workspaceId: ws, path: `${q(acc)}&ids=c1` });
    expect(bad.status).toBe(422);
  });
});
