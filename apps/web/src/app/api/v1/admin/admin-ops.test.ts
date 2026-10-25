import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  closeTestDb,
  seedAdAccount,
  seedConnection,
  seedStaff,
  seedWorkspace,
  testDb,
  truncateAll,
} from '@adxlens/db/testing';
import { setQueueAdminForTests } from '@/server/queue-admin';
import { asUser, call, fakeQueues, installTestServer, uninstallTestServer } from '../../../../test-utils';
import * as resync from './ad-accounts/[id]/resync/route';
import * as audit from './audit/route';
import * as operations from './operations/route';
import * as recon from './reconciliation/route';
import * as failed from './queues/[queue]/failed/route';
import * as job from './queues/[queue]/jobs/[jobId]/route';

const db = testDb();
let server: ReturnType<typeof installTestServer>;
beforeEach(async () => {
  await truncateAll(db);
  server = installTestServer(db);
});
afterEach(() => uninstallTestServer());
afterAll(() => closeTestDb());

describe('vận hành admin', () => {
  it('người ngoài → 404 ở mọi route; staff xem đồng bộ lỗi, hàng đợi, Meta API', async () => {
    const { workspace, owner } = await seedWorkspace(db);
    const u = asUser(owner);
    expect((await call(operations.GET, { user: u })).status).toBe(404);
    expect((await call(failed.GET, { user: u, params: { queue: 'sync' } })).status).toBe(404);
    expect(
      (
        await call(job.POST, {
          user: u,
          params: { queue: 'sync', jobId: 'j1' },
          body: { action: 'retry', reason: 'thử chạy' },
        })
      ).status,
    ).toBe(404);
    const conn = await seedConnection(db, workspace.id, owner.id);
    const acc = await seedAdAccount(db, workspace.id, conn.id);
    expect(
      (await call(resync.POST, { user: u, params: { id: acc.id }, body: { days: 7, reason: 'Khách nhờ' } })).status,
    ).toBe(404);

    const op = asUser(await seedStaff(db, false));
    const r = await call(operations.GET, { user: op });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ sync_issues: [], meta_usage: { calls: 0 } });
  });

  it('staff chạy lại đồng bộ (enqueue + nhật ký); ngày ngoài 1–90 → 422', async () => {
    const { workspace, owner } = await seedWorkspace(db);
    const conn = await seedConnection(db, workspace.id, owner.id);
    const acc = await seedAdAccount(db, workspace.id, conn.id);
    const op = asUser(await seedStaff(db, false));
    expect(
      (await call(resync.POST, { user: op, params: { id: acc.id }, body: { days: 120, reason: 'Khách nhờ' } })).status,
    ).toBe(422);
    const ok = await call(resync.POST, { user: op, params: { id: acc.id }, body: { days: 3, reason: 'Khách nhờ' } });
    expect(ok.status).toBe(200);
    expect(server.enqueue.calls.length).toBeGreaterThan(0);
    const items = (await call(audit.GET, { user: op })).body as { items: { action: string }[] };
    expect(items.items.map((i) => i.action)).toEqual(['sync.resync']);
  });

  it('job lỗi: lỗi đã che token; queue execute chỉ bỏ được; queue lạ → 404', async () => {
    const q = fakeQueues({
      sync: [
        { id: 'j1', name: 'sync:batch', reason: 'access_token=EAABsecret1234567890', attempts: 5, failedAt: null },
      ],
      execute: [{ id: 'x1', name: 'execute:action', reason: 'meta 500', attempts: 1, failedAt: null }],
    });
    setQueueAdminForTests(q);
    const op = asUser(await seedStaff(db, false));
    const list = await call(failed.GET, { user: op, params: { queue: 'sync' } });
    expect(list.body).toMatchObject({ retryable: true, items: [{ id: 'j1' }] });
    expect(JSON.stringify(list.body)).not.toContain('EAAB');
    expect((await call(failed.GET, { user: op, params: { queue: 'execute' } })).body).toMatchObject({
      retryable: false,
    });
    expect((await call(failed.GET, { user: op, params: { queue: 'toString' } })).status).toBe(404);

    const body = { action: 'retry', reason: 'Meta đã ổn' };
    expect((await call(job.POST, { user: op, params: { queue: 'execute', jobId: 'x1' }, body })).status).toBe(403);
    expect(
      (
        await call(job.POST, {
          user: op,
          params: { queue: 'execute', jobId: 'x1' },
          body: { action: 'discard', reason: 'Đã kiểm Ads Manager' },
        })
      ).status,
    ).toBe(204);
    expect((await call(job.POST, { user: op, params: { queue: 'sync', jobId: 'j1' }, body })).status).toBe(204);
    expect((await call(job.POST, { user: op, params: { queue: 'sync', jobId: 'j1' }, body })).status).toBe(404);
    expect(q.calls).toEqual(['remove execute:x1', 'retry sync:j1', 'retry sync:j1']);
  });
});

describe('đối chiếu toàn hệ thống (admin)', () => {
  it('người ngoài → 404; staff thấy tài khoản gán chưa xác nhận bị chặn chia sẻ; không trả chi tiêu', async () => {
    const { workspace, owner } = await seedWorkspace(db);
    expect((await call(recon.GET, { user: asUser(owner) })).status).toBe(404);
    const conn = await seedConnection(db, workspace.id, owner.id);
    await seedAdAccount(db, workspace.id, conn.id, { name: 'Mới gán' });
    const op = asUser(await seedStaff(db, false));
    const r = await call(recon.GET, { user: op, path: '/api/test?days=7&issues=1' });
    expect(r.body).toMatchObject({ items: [{ account_name: 'Mới gán', share_blocked: true, stale: true }] });
    expect(JSON.stringify(r.body)).not.toMatch(/spend_(internal|meta)/);
    expect((await call(recon.GET, { user: op, path: '/api/test?days=365' })).status).toBe(422);
  });
});
