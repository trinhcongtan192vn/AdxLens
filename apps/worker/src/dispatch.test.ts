import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeTestDb, testDb, truncateAll } from '@adxlens/db/testing';
import { dispatch, UnknownJobError } from './dispatch';
import { handlers } from './handlers';
import { testWorkerServices } from './testing';

const db = testDb();
const deps = testWorkerServices(db).services;
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());

describe('dispatch', () => {
  it('job không có trong danh mục bị từ chối', async () => {
    await expect(dispatch(handlers, deps, { name: 'evil:run', id: '1', data: {} })).rejects.toBeInstanceOf(
      UnknownJobError,
    );
  });

  it('payload sai schema bị từ chối trước khi chạy handler', async () => {
    await expect(dispatch(handlers, deps, { name: 'ops:health_check', id: '1', data: { tick: 5 } })).rejects.toThrow();
  });

  it('ops:health_check chạy kiểm tra sức khỏe', async () => {
    const r = (await dispatch(handlers, deps, {
      name: 'ops:health_check',
      id: '1',
      data: { tick: 'now' },
    })) as Record<string, { ok: boolean }>;
    expect(r.database?.ok).toBe(true);
  });

  it('maintenance:daily_tick chạy playbook token_expiring và gia hạn PayOS', async () => {
    const r = await dispatch(handlers, deps, { name: 'maintenance:daily_tick', id: '1', data: { tick: 'now' } });
    expect(r).toEqual({ notified: 0, expired: 0, skipped: 0, renewals: { reminded: 0, pastDue: 0, canceled: 0 } });
  });

  it('report:build: cờ p0_reports tắt → không dựng (test "cờ tắt thì không chạy")', async () => {
    const r = await dispatch(handlers, deps, {
      name: 'report:build',
      id: '1',
      data: { workspaceId: '00000000-0000-4000-8000-000000000001', reportId: '00000000-0000-4000-8000-000000000002' },
    });
    expect(r).toEqual({ status: 'flag_off' });
  });

  it('recommend:build: cờ p1_recommendations tắt → không tạo Weekly Action List', async () => {
    const r = await dispatch(handlers, deps, {
      name: 'recommend:build',
      id: '1',
      data: { workspaceId: '00000000-0000-4000-8000-000000000001', week: '2026-10-26' },
    });
    expect(r).toEqual({ status: 'flag_off' });
  });

  it('pdf:render: cờ tắt → không render', async () => {
    const t = testWorkerServices(db);
    const r = await dispatch(handlers, t.services, {
      name: 'pdf:render',
      id: '1',
      data: {
        workspaceId: '00000000-0000-4000-8000-000000000001',
        reportId: '00000000-0000-4000-8000-000000000002',
        version: '1',
      },
    });
    expect(r).toEqual({ status: 'flag_off' });
    expect(t.rendered).toEqual([]);
  });

  it('notify:digest: cờ tắt → không gửi', async () => {
    const t = testWorkerServices(db);
    const r = await dispatch(handlers, t.services, {
      name: 'notify:digest',
      id: '1',
      data: { workspaceId: '00000000-0000-4000-8000-000000000001', week: '2026-10-26' },
    });
    expect(r).toEqual({ status: 'flag_off' });
    expect(t.email.sent).toEqual([]);
  });
});
