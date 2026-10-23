import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@adxlens/db';
import { enableFlag } from '@adxlens/core/flags';
import { generateWeeklyActions } from '@adxlens/core/recommendation';
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
import * as assigneesRoute from './[id]/assignees/route';
import * as itemRoute from './[id]/route';
import * as onboardingRoute from '../me/onboarding/route';
import * as outcomesRoute from './outcomes/route';
import * as listRoute from './route';

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
  await db.insert(schema.findings).values({
    workspaceId: workspace.id,
    adAccountId: acc.id,
    ruleId: 'account_hygiene',
    ruleGroup: 'hygiene',
    entityType: 'adset',
    metaId: 'a1',
    entityName: 'Ad set mặc định',
    severity: 'low',
    evidence: {},
    explanation: {
      why: { key: 'rules.account_hygiene.why' },
      whatToDo: { key: 'rules.account_hygiene.what' },
      deepLink: null,
    },
    snapshotVersion: 'v1',
  });
  await generateWeeklyActions({ db, workspaceId: workspace.id }, '2026-10-26', {
    clock: { now: () => new Date() },
  });
  if (flagOn) {
    const pm = await seedStaff(db, true);
    for (const key of ['p0_reports', 'p1_recommendations'] as const) {
      await enableFlag(db, {
        workspaceId: workspace.id,
        key,
        staffUserId: pm.id,
        reason: 'test P1 weekly',
        override: true,
      });
    }
  }
  return { ws: workspace.id, user: asUser(owner) };
}

describe('API Weekly Action List (P101)', () => {
  it('cờ p1_recommendations tắt thì không chạy (404)', async () => {
    const { ws, user } = await setup(false);
    expect((await call(listRoute.GET, { user, workspaceId: ws })).status).toBe(404);
    expect(
      (
        await call(itemRoute.PATCH, {
          method: 'PATCH',
          user,
          workspaceId: ws,
          params: { id: '00000000-0000-4000-8000-000000000000' },
          body: { status: 'done' },
        })
      ).status,
    ).toBe(404);
    expect((await call(outcomesRoute.GET, { user, workspaceId: ws })).status).toBe(404);
    expect((await call(onboardingRoute.DELETE, { method: 'DELETE', user, workspaceId: ws })).status).toBe(404);
  });

  it('cờ bật: kết quả trước/sau (việc vừa làm → chờ đủ 7 ngày); đóng màn chào mừng', async () => {
    const { ws, user } = await setup(true);
    const [item] = ((await call(listRoute.GET, { user, workspaceId: ws })).body as { items: { id: string }[] }).items;
    await call(itemRoute.PATCH, {
      method: 'PATCH',
      user,
      workspaceId: ws,
      params: { id: item!.id },
      body: { status: 'done' },
    });
    const r = await call(outcomesRoute.GET, { user, workspaceId: ws });
    expect((r.body as { items: { state: string }[] }).items).toEqual([
      expect.objectContaining({ state: 'not_measured' }),
    ]);
    expect((await call(onboardingRoute.DELETE, { method: 'DELETE', user, workspaceId: ws })).status).toBe(204);
  });

  it('cờ bật: danh sách, đổi trạng thái (bỏ qua cần lý do), người nhận việc', async () => {
    const { ws, user } = await setup(true);
    const r = await call(listRoute.GET, { user, workspaceId: ws });
    expect(r.status).toBe(200);
    const items = (r.body as { items: { id: string; source_key: string; status: string }[] }).items;
    expect(items).toHaveLength(1);
    const id = items[0]!.id;
    const noReason = await call(itemRoute.PATCH, {
      method: 'PATCH',
      user,
      workspaceId: ws,
      params: { id },
      body: { status: 'skipped' },
    });
    expect(noReason.status).toBe(422);
    const ok = await call(itemRoute.PATCH, {
      method: 'PATCH',
      user,
      workspaceId: ws,
      params: { id },
      body: { status: 'skipped', skip_reason: 'wrong' },
    });
    expect(ok.status).toBe(200);
    const a = await call(assigneesRoute.GET, { user, workspaceId: ws, params: { id } });
    expect((a.body as { items: { user_id: string }[] }).items.map((m) => m.user_id)).toContain(user.id);
    const mine = await call(listRoute.GET, { user, workspaceId: ws, path: '/api/test?assignee=me' });
    expect((mine.body as { items: unknown[] }).items).toHaveLength(0);
  });
});
