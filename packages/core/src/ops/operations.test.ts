import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { recordingEnqueue } from '@adxlens/jobs';
import { schema } from '@adxlens/db';
import {
  closeTestDb,
  seedAdAccount,
  seedConnection,
  seedStaff,
  seedWorkspace,
  testDb,
  truncateAll,
} from '@adxlens/db/testing';
import {
  adminResync,
  failedJobs,
  handleFailedJob,
  listAdminAudit,
  metaApiUsage,
  scrubJobError,
  syncIssues,
  type QueueAdmin,
} from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());

const NOW = new Date('2026-10-23T05:00:00Z');
const clock = { now: () => NOW };

async function account() {
  const { workspace, owner } = await seedWorkspace(db, 'Agency Vận hành');
  const conn = await seedConnection(db, workspace.id, owner.id);
  const acc = await seedAdAccount(db, workspace.id, conn.id, { name: 'Cà phê Nhà Rang' });
  return { workspace, conn, acc };
}

function fakeQueues(): QueueAdmin & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    counts: async () => [{ queue: 'sync', waiting: 1, active: 0, delayed: 0, failed: 1 }],
    failed: async () => [
      {
        id: 'j1',
        name: 'sync:batch',
        reason: 'lỗi gọi ?access_token=EAABsecret1234567890',
        attempts: 5,
        failedAt: NOW,
      },
    ],
    retry: async (q, id) => (calls.push(`retry ${q}:${id}`), id === 'j1'),
    remove: async (q, id) => (calls.push(`remove ${q}:${id}`), id === 'j1'),
  };
}

describe('vận hành đồng bộ (admin)', () => {
  it('liệt kê đồng bộ lỗi 7 ngày và đang chạy quá 3 giờ; bỏ kết nối đã ngắt', async () => {
    const { workspace, acc, conn } = await account();
    const base = {
      workspaceId: workspace.id,
      adAccountId: acc.id,
      kind: 'daily' as const,
      dateFrom: '2026-10-20',
      dateTo: '2026-10-22',
    };
    await db.insert(schema.syncRuns).values([
      { ...base, status: 'failed', error: 'no_access', finishedAt: new Date(NOW.getTime() - 3600_000) },
      { ...base, status: 'failed', error: 'meta_17', finishedAt: new Date(NOW.getTime() - 8 * 86_400_000) },
      { ...base, status: 'running', startedAt: new Date(NOW.getTime() - 4 * 3600_000) },
      { ...base, status: 'running', startedAt: new Date(NOW.getTime() - 600_000) },
      { ...base, status: 'succeeded', finishedAt: NOW },
    ]);
    const rows = await syncIssues(db, clock);
    expect(rows.map((r) => [r.status, r.error]).sort()).toEqual([
      ['failed', 'no_access'],
      ['running', null],
    ]);
    expect(rows[0]).toMatchObject({ workspaceName: 'Agency Vận hành', accountName: 'Cà phê Nhà Rang' });
    await db.update(schema.metaConnections).set({ status: 'revoked' }).where(eq(schema.metaConnections.id, conn.id));
    expect(await syncIssues(db, clock)).toEqual([]);
  });

  it('staff chạy lại đồng bộ N ngày đến hôm qua (giờ tài khoản), có nhật ký; kết nối đã ngắt → 409', async () => {
    const { acc, conn } = await account();
    const sa = await seedStaff(db, false);
    const enqueue = recordingEnqueue();
    const actor = { userId: sa.id, role: 'operator' as const };
    const r = await adminResync(
      db,
      actor,
      { adAccountId: acc.id, days: 7, reason: 'Khách báo thiếu số' },
      { enqueue, clock },
    );
    expect(r).toMatchObject({ from: '2026-10-16', to: '2026-10-22' });
    expect(enqueue.calls.length).toBeGreaterThan(0);
    expect((await listAdminAudit(db)).map((a) => [a.action, a.targetId])).toEqual([['sync.resync', acc.id]]);
    await expect(
      adminResync(db, actor, { adAccountId: acc.id, days: 7, reason: 'x' }, { enqueue, clock }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    await db.update(schema.metaConnections).set({ status: 'revoked' }).where(eq(schema.metaConnections.id, conn.id));
    await expect(
      adminResync(db, actor, { adAccountId: acc.id, days: 7, reason: 'Khách báo thiếu số' }, { enqueue, clock }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('mức dùng Meta API: tổng, lỗi, rate limit (4/17/32/613/80000–80014), top workspace', async () => {
    const { workspace } = await account();
    const at = new Date(NOW.getTime() - 60_000);
    const row = { workspaceId: workspace.id, endpoint: 'act/insights', durationMs: 100, at };
    await db.insert(schema.jobAudit).values([
      { ...row, status: 200 },
      { ...row, status: 400, errorCode: 17 },
      { ...row, status: 400, errorCode: 80004 },
      { ...row, status: 500, errorCode: 1 },
      { ...row, status: 200, at: new Date(NOW.getTime() - 2 * 3600_000) },
    ]);
    const u = await metaApiUsage(db, { minutes: 60 }, clock);
    expect(u).toMatchObject({ calls: 4, errors: 3, rateLimited: 2, avgMs: 100 });
    expect(u.top).toEqual([{ workspaceId: workspace.id, workspaceName: 'Agency Vận hành', calls: 4, rateLimited: 2 }]);
  });
});

describe('hàng đợi (admin)', () => {
  it('lý do lỗi được che token; job ghi Meta không chạy lại được; chạy lại / bỏ có nhật ký', async () => {
    const q = fakeQueues();
    const [j] = await failedJobs(q, 'sync');
    expect(j!.reason).not.toContain('EAAB');
    expect(scrubJobError('password: hunter2 ok')).toBe('password: [đã che] ok');
    const sa = await seedStaff(db, false);
    const actor = { userId: sa.id, role: 'operator' as const };
    await expect(
      handleFailedJob(db, q, actor, { queue: 'execute', jobId: 'j1', action: 'retry', reason: 'Chạy lại ghi' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await handleFailedJob(db, q, actor, {
      queue: 'execute',
      jobId: 'j1',
      action: 'discard',
      reason: 'Đã kiểm Ads Manager',
    });
    await handleFailedJob(db, q, actor, { queue: 'sync', jobId: 'j1', action: 'retry', reason: 'Meta đã ổn' });
    await expect(
      handleFailedJob(db, q, actor, { queue: 'sync', jobId: 'nope', action: 'retry', reason: 'Meta đã ổn' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(q.calls).toEqual(['remove execute:j1', 'retry sync:j1', 'retry sync:nope']);
    expect((await listAdminAudit(db)).map((a) => a.action)).toEqual(['queue.retry', 'queue.discard']);
  });
});
