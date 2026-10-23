import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeTestDb, seedStaff, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { asUser, call, installTestServer, uninstallTestServer } from '../../../../test-utils';
import * as matrix from './workspaces/route';
import * as checklist from './workspaces/[id]/flags/[key]/checklist/route';
import * as toggle from './workspaces/[id]/flags/[key]/route';
import * as history from './workspaces/[id]/flag-history/route';

const db = testDb();
beforeEach(async () => {
  await truncateAll(db);
  installTestServer(db);
});
afterEach(() => uninstallTestServer());
afterAll(() => closeTestDb());

describe('API admin cờ (AD01, AD02)', () => {
  it('không phải staff → 404 ở mọi route admin (không lộ có trang nội bộ)', async () => {
    const { workspace, owner } = await seedWorkspace(db);
    const u = asUser(owner);
    expect((await call(matrix.GET, { user: u })).status).toBe(404);
    const params = { id: workspace.id, key: 'p0_reports' };
    expect((await call(checklist.GET, { user: u, params })).status).toBe(404);
    const tryEnable = await call(toggle.POST, {
      user: u,
      params,
      body: { enabled: true, reason: 'owner tu bat', override: true },
    });
    expect(tryEnable.status).toBe(404);
  });

  it('staff thường tắt được nhưng không bật được; PM bật — checklist chưa đạt cần vượt, được ghi log', async () => {
    const { workspace } = await seedWorkspace(db);
    const staff = asUser(await seedStaff(db, false));
    const pm = asUser(await seedStaff(db, true));
    const params = { id: workspace.id, key: 'p0_reports' };
    expect(
      (await call(toggle.POST, { user: staff, params, body: { enabled: true, reason: 'thử bật cờ' } })).status,
    ).toBe(403);

    const cl = await call(checklist.GET, { user: pm, params });
    expect((cl.body as { items: { passed: boolean }[] }).items.some((c) => !c.passed)).toBe(true);
    const blocked = await call(toggle.POST, { user: pm, params, body: { enabled: true, reason: 'design partner' } });
    expect(blocked.status).toBe(409);
    const ok = await call(toggle.POST, {
      user: pm,
      params,
      body: { enabled: true, reason: 'design partner', override: true },
    });
    expect(ok.body).toMatchObject({ enabled: true, override: true });

    const m = await call(matrix.GET, { user: pm });
    expect(m.body).toMatchObject({
      can_enable_flags: true,
      items: [{ id: workspace.id, flags: { p0_reports: { enabled: true } } }],
    });
    const off = await call(toggle.POST, { user: staff, params, body: { enabled: false, reason: 'sự cố số liệu' } });
    expect(off.body).toMatchObject({ enabled: false, turned_off: ['p0_reports'] });
    const h = await call(history.GET, { user: pm, params: { id: workspace.id } });
    const items = (h.body as { items: { new_value: boolean; override: boolean }[] }).items;
    expect(items.map((x) => [x.new_value, x.override])).toEqual([
      [false, false],
      [true, true],
    ]);
  });

  it('khóa cờ sai → 404; lý do quá ngắn → 422', async () => {
    const { workspace } = await seedWorkspace(db);
    const pm = asUser(await seedStaff(db, true));
    expect((await call(checklist.GET, { user: pm, params: { id: workspace.id, key: 'p9_magic' } })).status).toBe(404);
    const short = await call(toggle.POST, {
      user: pm,
      params: { id: workspace.id, key: 'p0_reports' },
      body: { enabled: false, reason: 'x' },
    });
    expect(short.status).toBe(422);
  });
});
