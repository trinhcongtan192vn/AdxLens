import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getFlags } from '@adxlens/core/flags';
import { closeTestDb, seedStaff, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { asUser, call, installTestServer, uninstallTestServer } from '../../../../test-utils';
import * as global from './flags/global/[key]/route';
import * as hist from './flags/history/route';
import * as plan from './flags/plans/[plan]/[key]/route';
import * as toggle from './workspaces/[id]/flags/[key]/route';

const db = testDb();
beforeEach(async () => {
  await truncateAll(db);
  installTestServer(db);
});
afterEach(() => uninstallTestServer());
afterAll(() => closeTestDb());

describe('API admin cờ toàn app / gói / ngoại lệ (ADR-0024)', () => {
  it('superadmin bật toàn app + sửa gói; operator bị chặn; ngoại lệ tắt riêng rồi bỏ ngoại lệ', async () => {
    const { workspace } = await seedWorkspace(db);
    const sa = asUser(await seedStaff(db, true));
    const op = asUser(await seedStaff(db, false));
    const ctx = { db, workspaceId: workspace.id };
    const body = (enabled: boolean) => ({ enabled, reason: 'mở toàn app sau thử nghiệm' });

    expect((await call(global.POST, { user: op, params: { key: 'p0_reports' }, body: body(true) })).status).toBe(403);
    expect((await call(global.POST, { user: sa, params: { key: 'p9' }, body: body(true) })).status).toBe(404);
    // Cờ con trước cờ cha → 409.
    expect(
      (await call(global.POST, { user: sa, params: { key: 'p1_recommendations' }, body: body(true) })).status,
    ).toBe(409);
    expect((await call(global.POST, { user: sa, params: { key: 'p0_reports' }, body: body(true) })).body).toEqual({
      changed: ['p0_reports'],
    });
    expect((await getFlags(ctx)).p0_reports).toBe(true);

    // Gói Free bỏ P0 → workspace (Free) mất P0; gói lạ → 404; operator → 403.
    expect(
      (await call(plan.POST, { user: sa, params: { plan: 'gold', key: 'p0_reports' }, body: body(false) })).status,
    ).toBe(404);
    expect(
      (await call(plan.POST, { user: op, params: { plan: 'free', key: 'p0_reports' }, body: body(false) })).status,
    ).toBe(403);
    await call(plan.POST, { user: sa, params: { plan: 'free', key: 'p0_reports' }, body: body(false) });
    expect((await getFlags(ctx)).p0_reports).toBe(false);
    await call(plan.POST, { user: sa, params: { plan: 'free', key: 'p0_reports' }, body: body(true) });

    // Ngoại lệ tắt riêng (operator được) → bỏ ngoại lệ → về toàn app × gói.
    const params = { id: workspace.id, key: 'p0_reports' };
    await call(toggle.POST, { user: op, params, body: { enabled: false, reason: 'khách có sự cố' } });
    expect((await getFlags(ctx)).p0_reports).toBe(false);
    const del = await call(toggle.DELETE, { user: op, params, method: 'DELETE', body: { reason: 'đã xử lý xong' } });
    expect(del.status).toBe(204);
    expect((await getFlags(ctx)).p0_reports).toBe(true);

    const h = await call(hist.GET, { user: op });
    expect((h.body as { items: { scope: string }[] }).items.map((x) => x.scope)).toEqual(['plan', 'plan', 'global']);
  });
});
