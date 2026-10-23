import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeTestDb, seedStaff, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { asUser, call, installTestServer, uninstallTestServer } from '../../../../test-utils';
import * as billing from './billing/route';
import * as plan from './billing/plans/[key]/route';
import * as deletions from './deletions/route';
import * as emails from './emails/route';
import * as execution from './execution/route';
import * as breaker from './execution/breakers/[adAccountId]/route';
import * as system from './system/route';
import * as alertEmails from './system/alert-emails/route';
import * as maintenance from './system/maintenance/route';
import * as wsBilling from './workspaces/[id]/billing/route';

const db = testDb();
beforeEach(async () => {
  await truncateAll(db);
  installTestServer(db);
});
afterEach(() => uninstallTestServer());
afterAll(() => closeTestDb());

const UUID = randomUUID();

describe('admin: thanh toán, xóa dữ liệu, thực thi, hệ thống, mẫu email', () => {
  it('người ngoài → 404 ở mọi route', async () => {
    const { workspace, owner } = await seedWorkspace(db);
    const u = asUser(owner);
    const r = 'Lý do thử nghiệm';
    const results = await Promise.all([
      call(billing.GET, { user: u }),
      call(plan.PATCH, {
        user: u,
        params: { key: 'growth' },
        body: {
          monthly_price_vnd: '1',
          monthly_price_usd: null,
          included_accounts: 1,
          extra_account_vnd: '0',
          reason: r,
        },
      }),
      call(wsBilling.POST, {
        user: u,
        params: { id: workspace.id },
        body: { action: 'comp', plan: 'scale', reason: r },
      }),
      call(deletions.GET, { user: u }),
      call(execution.GET, { user: u }),
      call(breaker.POST, { user: u, params: { adAccountId: UUID }, body: { workspace_id: workspace.id, reason: r } }),
      call(system.GET, { user: u }),
      call(alertEmails.PUT, { user: u, body: { emails: ['a@x.vn'], reason: r } }),
      call(maintenance.PUT, {
        user: u,
        body: { active: false, message_vi: '', message_en: '', ends_at: null, reason: r },
      }),
      call(emails.GET, { user: u }),
    ]);
    expect(results.map((x) => x.status)).toEqual(Array(results.length).fill(404));
  });

  it('operator xem được; thao tác sửa gói / tặng gói / kênh cảnh báo / bảo trì / đóng breaker → 403', async () => {
    const { workspace } = await seedWorkspace(db);
    const op = asUser(await seedStaff(db, false));
    const r = 'Lý do thử nghiệm';
    for (const h of [billing.GET, deletions.GET, execution.GET, system.GET, emails.GET]) {
      expect((await call(h, { user: op })).status).toBe(200);
    }
    const writes = await Promise.all([
      call(plan.PATCH, {
        user: op,
        params: { key: 'growth' },
        body: {
          monthly_price_vnd: '1',
          monthly_price_usd: null,
          included_accounts: 1,
          extra_account_vnd: '0',
          reason: r,
        },
      }),
      call(wsBilling.POST, {
        user: op,
        params: { id: workspace.id },
        body: { action: 'comp', plan: 'scale', reason: r },
      }),
      call(alertEmails.PUT, { user: op, body: { emails: ['a@x.vn'], reason: r } }),
      call(maintenance.PUT, {
        user: op,
        body: { active: true, message_vi: 'Bảo trì', message_en: 'Maintenance', ends_at: null, reason: r },
      }),
      call(breaker.POST, { user: op, params: { adAccountId: UUID }, body: { workspace_id: workspace.id, reason: r } }),
    ]);
    expect(writes.map((x) => x.status)).toEqual([403, 403, 403, 403, 403]);
  });

  it('superadmin sửa giá (float → 422), tặng gói, bật bảo trì; hệ thống không lộ Slack webhook', async () => {
    const { workspace } = await seedWorkspace(db);
    const sa = asUser(await seedStaff(db, true));
    const r = 'Lý do thử nghiệm';
    const body = {
      monthly_price_vnd: '1490000',
      monthly_price_usd: '59.00',
      included_accounts: 12,
      extra_account_vnd: '69000',
      reason: r,
    };
    expect(
      (await call(plan.PATCH, { user: sa, params: { key: 'growth' }, body: { ...body, monthly_price_vnd: '14.9' } }))
        .status,
    ).toBe(422);
    expect((await call(plan.PATCH, { user: sa, params: { key: 'nope' }, body })).status).toBe(404);
    expect((await call(plan.PATCH, { user: sa, params: { key: 'growth' }, body })).status).toBe(204);
    const b = (await call(billing.GET, { user: sa })).body as { plans: { key: string; monthly_price_vnd: string }[] };
    expect(b.plans.find((p) => p.key === 'growth')).toMatchObject({ monthly_price_vnd: '1490000' });
    expect(
      (
        await call(wsBilling.POST, {
          user: sa,
          params: { id: workspace.id },
          body: { action: 'comp', plan: 'scale', reason: r },
        })
      ).status,
    ).toBe(204);
    expect(
      (
        await call(maintenance.PUT, {
          user: sa,
          body: { active: true, message_vi: 'Bảo trì 22h', message_en: 'Maintenance 10pm', ends_at: null, reason: r },
        })
      ).status,
    ).toBe(200);
    const s = await call(system.GET, { user: sa });
    expect(s.body).toMatchObject({ maintenance: { active: true }, alerts: { slack_configured: false } });
    expect(JSON.stringify(s.body)).not.toMatch(/hooks\.slack\.com/);
  });

  it('mẫu email vi / en có nội dung HTML', async () => {
    const op = asUser(await seedStaff(db, false));
    for (const locale of ['vi', 'en']) {
      const r = await call(emails.GET, { user: op, path: `/api/test?locale=${locale}` });
      const items = (r.body as { items: { key: string; html: string }[] }).items;
      expect(items.map((i) => i.key)).toContain('invitation');
      expect(items.every((i) => i.html.includes('<'))).toBe(true);
    }
  });
});
