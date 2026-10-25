import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { enableFlag } from '@adxlens/core/flags';
import {
  closeTestDb,
  seedAdAccount,
  seedConnection,
  seedMember,
  seedStaff,
  seedWorkspace,
  testDb,
  truncateAll,
} from '@adxlens/db/testing';
import { asUser, call, installTestServer, uninstallTestServer } from '../../../../test-utils';
import * as copyRoute from './[id]/copy/route';
import * as modeRoute from './[id]/mode/route';
import * as itemRoute from './[id]/route';
import * as backtestRoute from './backtest/route';
import * as effRoute from './effectiveness/route';
import * as listRoute from './route';
import * as templatesRoute from './templates/route';

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
  if (flagOn) {
    const pm = await seedStaff(db, true);
    for (const key of ['p0_reports', 'p1_recommendations', 'p2a_approve', 'p2b_auto'] as const) {
      await enableFlag(db, {
        workspaceId: workspace.id,
        key,
        staffUserId: pm.id,
        reason: 'test automation',
        override: true,
      });
    }
  }
  const body = {
    adAccountId: acc.id,
    name: 'Tạm dừng ad mệt',
    level: 'ad',
    condition: [{ metric: 'ctr_change_pct', op: 'lte', value: '-25' }],
    action: { type: 'pause_ad' },
  };
  return { ws: workspace.id, user: asUser(owner), body };
}

describe('API rule tự động (P211–P214)', () => {
  it('cờ tự động hóa tắt thì không chạy (404)', async () => {
    const { ws, user, body } = await setup(false);
    expect((await call(listRoute.GET, { user, workspaceId: ws })).status).toBe(404);
    expect((await call(listRoute.POST, { user, workspaceId: ws, body })).status).toBe(404);
    expect((await call(templatesRoute.GET, { user, workspaceId: ws })).status).toBe(404);
    expect((await call(backtestRoute.POST, { user, workspaceId: ws, body })).status).toBe(404);
    expect((await call(effRoute.GET, { user, workspaceId: ws })).status).toBe(404);
  });

  it('sao chép rule (ADR-0014): cờ tắt → 404; cờ bật → bản sao chạy thử ở tài khoản khác, kiểu khớp HOẶC giữ nguyên', async () => {
    const off = await setup(false);
    const copyOff = await call(copyRoute.POST, {
      user: off.user,
      workspaceId: off.ws,
      params: { id: '00000000-0000-4000-8000-000000000000' },
      body: { ad_account_ids: [off.body.adAccountId] },
    });
    expect(copyOff.status).toBe(404);

    const { ws, user, body } = await setup(true);
    const created = await call(listRoute.POST, { user, workspaceId: ws, body: { ...body, match: 'any' } });
    const ruleId = (created.body as { id: string }).id;
    const conn2 = await seedConnection(db, ws, user.id, 'meta-copy');
    const acc2 = await seedAdAccount(db, ws, conn2.id);
    const r = await call(copyRoute.POST, {
      user,
      workspaceId: ws,
      params: { id: ruleId },
      body: { ad_account_ids: [acc2.id] },
    });
    expect(r.body).toMatchObject({ created: [{ ad_account_id: acc2.id }], skipped: [] });
    const copied = (r.body as { created: { id: string }[] }).created[0]!.id;
    const got = await call(itemRoute.GET, { user, workspaceId: ws, params: { id: copied } });
    expect(got.body).toMatchObject({ mode: 'shadow', match: 'any' });
  });

  it('cờ bật: mẫu, backtest, tạo (shadow), bật live bị chặn khi chưa đủ 14 ngày, tạm dừng; buyer 403', async () => {
    const { ws, user, body } = await setup(true);
    // ADR-0014 thêm mẫu "tăng ngân sách ad set thắng" (trước: 3 mẫu); ADR-0021 thêm 4 tactic (Stop-loss, Surf,
    // Sunsetting, Revive).
    const tpl = ((await call(templatesRoute.GET, { user, workspaceId: ws })).body as { items: { key: string }[] })
      .items;
    expect(tpl).toHaveLength(8);
    expect(tpl.map((x) => x.key)).toContain('increase_budget_winner');
    expect((await call(backtestRoute.POST, { user, workspaceId: ws, body })).body).toMatchObject({
      days: 30,
      items: [],
    });
    const c = await call(listRoute.POST, { user, workspaceId: ws, body });
    expect(c.status).toBe(201);
    const id = (c.body as { id: string }).id;
    const live = await call(modeRoute.POST, { user, workspaceId: ws, params: { id }, body: { mode: 'live' } });
    expect(live.status).toBe(409);
    expect(
      (await call(modeRoute.POST, { user, workspaceId: ws, params: { id }, body: { mode: 'paused' } })).body,
    ).toEqual({
      id,
      mode: 'paused',
    });
    expect(((await call(itemRoute.GET, { user, workspaceId: ws, params: { id } })).body as { mode: string }).mode).toBe(
      'paused',
    );
    const buyer = asUser(await seedMember(db, ws, 'buyer'));
    expect((await call(listRoute.GET, { user: buyer, workspaceId: ws })).status).toBe(403);
  });
});
