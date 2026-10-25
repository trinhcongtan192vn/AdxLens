import { afterAll, beforeEach, describe, expect, it } from 'vitest';
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
import { adminInbox, INBOX_KEYS, openIncident, setGlobalKillSwitchByStaff } from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());

const NOW = new Date('2026-10-23T05:00:00Z');
const clock = { now: () => NOW };
const DAY = 86_400_000;

describe('"Hôm nay" của admin', () => {
  it('không có việc → mọi mục 0, kill switch tắt', async () => {
    const inbox = await adminInbox(db, clock);
    expect(inbox.total).toBe(0);
    for (const k of INBOX_KEYS) expect(inbox.items[k]).toEqual({ count: 0, urgent: false, oldestAt: null, top: [] });
    expect(inbox.killSwitch.active).toBe(false);
  });

  it('gom việc chờ trên mọi workspace: sự cố (P1 khẩn), breaker, xóa quá hạn, đề xuất cờ, thanh toán; kill switch', async () => {
    const { workspace, owner } = await seedWorkspace(db, 'Agency A');
    const conn = await seedConnection(db, workspace.id, owner.id);
    const acc = await seedAdAccount(db, workspace.id, conn.id, { name: 'TK Cà phê' });

    await openIncident(db, {
      kind: 'sync',
      severity: 'P2',
      source: 'test',
      title: 'Đồng bộ lỗi',
      fingerprint: 'f-2',
      workspaceId: workspace.id,
    });
    await openIncident(db, { kind: 'meta', severity: 'P1', source: 'test', title: 'Meta sập', fingerprint: 'f-1' });
    await db
      .insert(schema.circuitBreakers)
      .values({ adAccountId: acc.id, workspaceId: workspace.id, consecutiveFailures: 3, open: true, openedAt: NOW });
    const base = { workspaceId: workspace.id, connectionId: conn.id, source: 'user' as const, metaUserId: 'u1' };
    await db.insert(schema.deletionRequests).values([
      { ...base, code: 'XD-QUAHAN', status: 'pending', purgeAfter: new Date(NOW.getTime() - 3 * DAY) },
      { ...base, code: 'XD-CONHAN', status: 'pending', purgeAfter: new Date(NOW.getTime() + DAY) },
    ]);
    const op = await seedStaff(db, false);
    await db
      .insert(schema.flagProposals)
      .values({ workspaceId: workspace.id, flagKey: 'p1_recommendations', proposedBy: op.id, reason: 'Khách thử' });
    await db.insert(schema.subscriptions).values({
      workspaceId: workspace.id,
      planKey: 'starter',
      status: 'past_due',
      pastDueSince: new Date(NOW.getTime() - 2 * DAY),
    });

    const inbox = await adminInbox(db, clock);
    expect(inbox.items.incidents).toMatchObject({ count: 2, urgent: true });
    // P1 lên đầu.
    expect(inbox.items.incidents.top[0]).toEqual({ label: 'P1 · Meta sập', workspaceId: null, workspaceName: null });
    expect(inbox.items.incidents.top[1]).toMatchObject({ workspaceId: workspace.id, workspaceName: 'Agency A' });
    expect(inbox.items.breakers).toMatchObject({ count: 1, urgent: true, top: [{ label: 'TK Cà phê' }] });
    // Chỉ yêu cầu xóa quá hạn được tính.
    expect(inbox.items.deletions).toMatchObject({ count: 1, urgent: true, top: [{ label: 'XD-QUAHAN' }] });
    expect(inbox.items.flagProposals).toMatchObject({
      count: 1,
      urgent: false,
      top: [{ label: 'p1_recommendations' }],
    });
    expect(inbox.items.billing).toMatchObject({ count: 1, oldestAt: new Date(NOW.getTime() - 2 * DAY) });
    expect(inbox.total).toBe(INBOX_KEYS.reduce((t, k) => t + inbox.items[k].count, 0));

    const sa = await seedStaff(db, true);
    await setGlobalKillSwitchByStaff(db, { userId: sa.id, role: 'superadmin' }, { active: true, reason: 'Diễn tập' });
    expect((await adminInbox(db, clock)).killSwitch).toMatchObject({ active: true, reason: 'Diễn tập' });
  });
});
