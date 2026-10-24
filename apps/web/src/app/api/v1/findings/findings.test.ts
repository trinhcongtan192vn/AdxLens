import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@adxlens/db';
import {
  closeTestDb,
  seedAdAccount,
  seedConnection,
  seedMember,
  seedWorkspace,
  testDb,
  truncateAll,
} from '@adxlens/db/testing';
import { asUser, call, installTestServer, uninstallTestServer } from '../../../../test-utils';
import * as list from '../ad-accounts/[id]/findings/route';
import * as detail from './[id]/route';
import * as feedback from './[id]/feedback/route';

const db = testDb();
beforeEach(async () => {
  await truncateAll(db);
  installTestServer(db);
});
afterEach(() => uninstallTestServer());
afterAll(() => closeTestDb());

async function setup() {
  const { workspace, owner } = await seedWorkspace(db);
  const conn = await seedConnection(db, workspace.id, owner.id);
  const acc = await seedAdAccount(db, workspace.id, conn.id, { currency: 'VND' });
  const mk = (metaId: string, severity: 'low' | 'high') => ({
    workspaceId: workspace.id,
    adAccountId: acc.id,
    ruleId: 'test_rule',
    ruleGroup: 'test',
    entityType: 'ad',
    metaId,
    entityName: `Ad ${metaId}`,
    severity,
    impactEstimate: severity === 'high' ? '2850000.0000' : null,
    impactMethod: 'rules.test_rule.impact',
    evidence: { ctr: [0.018, 0.009] },
    explanation: {
      why: { key: 'rules.test_rule.why' },
      whatToDo: { key: 'rules.test_rule.what' },
      deepLink: 'https://x',
    },
    snapshotVersion: 'v1',
  });
  const rows = await db
    .insert(schema.findings)
    .values([mk('1', 'low'), mk('2', 'high')])
    .returning();
  return { ws: workspace.id, u: asUser(owner), acc, rows };
}

describe('API phát hiện', () => {
  it('danh sách: mức cao trước, có tác động + tiền tệ, lọc mức độ', async () => {
    const { ws, u, acc } = await setup();
    const r = await call(list.GET, { user: u, workspaceId: ws, params: { id: acc.id }, path: `/x?limit=10` });
    expect(r.status).toBe(200);
    const items = (
      r.body as { items: { severity: string; impact_estimate: unknown; explanation: { deep_link: string } }[] }
    ).items;
    expect(items.map((i) => i.severity)).toEqual(['high', 'low']);
    expect(items[0]!.impact_estimate).toMatchObject({ amount: '2850000.0000', currency: 'VND' });
    expect(items[0]!.explanation.deep_link).toBe('https://x');
    const high = await call(list.GET, { user: u, workspaceId: ws, params: { id: acc.id }, path: `/x?severity=low` });
    expect((high.body as { items: unknown[] }).items).toHaveLength(1);
  });

  it('chi tiết + phản hồi; bỏ qua thiếu lý do → 422; buyer không có Client → 404', async () => {
    const { ws, u, rows } = await setup();
    const id = rows[0]!.id;
    expect((await call(detail.GET, { user: u, workspaceId: ws, params: { id } })).status).toBe(200);
    expect(
      (await call(feedback.POST, { user: u, workspaceId: ws, params: { id }, body: { kind: 'seen' } })).status,
    ).toBe(204);
    expect(
      (await call(feedback.POST, { user: u, workspaceId: ws, params: { id }, body: { kind: 'dismissed' } })).status,
    ).toBe(422);
    const buyer = asUser(await seedMember(db, ws, 'buyer'));
    expect((await call(detail.GET, { user: buyer, workspaceId: ws, params: { id } })).status).toBe(404);
  });
});
