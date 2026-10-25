import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { enableFlag } from '@adxlens/core/flags';
import { closeTestDb, seedMember, seedStaff, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { asUser, call, installTestServer, uninstallTestServer } from '../../../../test-utils';
import * as killRoute from '../kill-switch/route';
import * as route from './route';

const db = testDb();
beforeEach(async () => {
  await truncateAll(db);
  installTestServer(db);
});
afterEach(() => uninstallTestServer());
afterAll(() => closeTestDb());

const body = {
  maxBudgetChangePct: '10',
  maxActionsPerDay: 3,
  minDataDays: 3,
  quietStartHour: 22,
  quietEndHour: 6,
  breakerFailures: 3,
  excludeMetaIds: ['120000000001'],
};

describe('API guardrails (P205)', () => {
  it('cờ duyệt hành động tắt → 404', async () => {
    const { workspace, owner } = await seedWorkspace(db);
    expect((await call(route.GET, { user: asUser(owner), workspaceId: workspace.id })).status).toBe(404);
  });

  it('cờ bật: Owner xem mặc định, siết chặt được; nới lỏng → 422; manager → 403', async () => {
    const { workspace, owner } = await seedWorkspace(db);
    const pm = await seedStaff(db, true);
    for (const key of ['p0_reports', 'p1_recommendations', 'p2a_approve'] as const) {
      await enableFlag(db, {
        workspaceId: workspace.id,
        key,
        staffUserId: pm.id,
        reason: 'test guardrails',
        override: true,
      });
    }
    const u = asUser(owner);
    const g = await call(route.GET, { user: u, workspaceId: workspace.id });
    expect((g.body as { defaults: { maxBudgetChangePct: string } }).defaults.maxBudgetChangePct).toBe('15.00');
    expect((await call(route.PUT, { method: 'PUT', user: u, workspaceId: workspace.id, body })).status).toBe(200);
    const loose = await call(route.PUT, {
      method: 'PUT',
      user: u,
      workspaceId: workspace.id,
      body: { ...body, maxBudgetChangePct: '30' },
    });
    expect(loose.status).toBe(422);
    expect((loose.body as { error: { code: string } }).error.code).toBe('GUARDRAIL_VIOLATION');
    const m = asUser(await seedMember(db, workspace.id, 'manager'));
    expect((await call(route.GET, { user: m, workspaceId: workspace.id })).status).toBe(403);
  });
});

describe('API kill switch workspace (P205)', () => {
  it('cờ tắt → 404; cờ bật: Owner bật (cần lý do) / tắt, GET trả trạng thái', async () => {
    const { workspace, owner } = await seedWorkspace(db);
    const u = asUser(owner);
    expect((await call(killRoute.GET, { user: u, workspaceId: workspace.id })).status).toBe(404);
    const pm = await seedStaff(db, true);
    for (const key of ['p0_reports', 'p1_recommendations', 'p2a_approve'] as const) {
      await enableFlag(db, {
        workspaceId: workspace.id,
        key,
        staffUserId: pm.id,
        reason: 'test kill switch',
        override: true,
      });
    }
    expect(
      (await call(killRoute.POST, { user: u, workspaceId: workspace.id, body: { active: true, reason: '' } })).status,
    ).toBe(422);
    const on = await call(killRoute.POST, {
      user: u,
      workspaceId: workspace.id,
      body: { active: true, reason: 'Khách yêu cầu' },
    });
    expect(on.body).toEqual({ canceled: 0 });
    const g = await call(killRoute.GET, { user: u, workspaceId: workspace.id });
    expect((g.body as { workspace: { active: boolean } }).workspace.active).toBe(true);
  });
});
