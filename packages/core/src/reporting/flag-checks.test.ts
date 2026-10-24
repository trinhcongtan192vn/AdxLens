import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@adxlens/db';
import {
  closeTestDb,
  seedAdAccount,
  seedClient,
  seedConnection,
  seedWorkspace,
  testDb,
  truncateAll,
} from '@adxlens/db/testing';
import { resetFlagRegistry, runChecklist } from '@adxlens/core/flags';
import { adminWorkspaceMatrix, openIncident } from '@adxlens/core/ops';
import { registerReportingFlagChecks } from './index';

const db = testDb();
const now = () => new Date('2026-10-23T03:00:00Z');
beforeAll(() => {
  resetFlagRegistry();
  registerReportingFlagChecks({ now });
});
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());

async function ws(confirmed: boolean, recon: 'ok' | 'warning' | null) {
  const { workspace, owner } = await seedWorkspace(db);
  const client = await seedClient(db, workspace.id, 'Linh');
  const conn = await seedConnection(db, workspace.id, owner.id);
  const acc = await seedAdAccount(db, workspace.id, conn.id, { clientId: client.id, confirmed });
  if (recon) {
    await db.insert(schema.reconciliationResults).values({
      workspaceId: workspace.id,
      adAccountId: acc.id,
      date: '2026-10-21',
      spendInternal: '1',
      spendMeta: '1',
      resultsInternal: 1,
      resultsMeta: 1,
      spendDeltaPct: recon === 'ok' ? '0' : '2',
      resultsDeltaPct: '0',
      status: recon,
    });
  }
  return workspace.id;
}

const ids = (r: { id: string; passed: boolean }[]) => Object.fromEntries(r.map((c) => [c.id, c.passed]));

describe('checklist cờ p0_reports (L3 18.3)', () => {
  it('đủ điều kiện → mọi mục đạt', async () => {
    const id = await ws(true, 'ok');
    expect(ids(await runChecklist(db, id, 'p0_reports'))).toEqual({
      accounts_confirmed: true,
      reconciliation_ok_7d: true,
      no_open_p1: true,
    });
  });

  it('chưa xác nhận, lệch, chưa đối chiếu, sự cố P1 → chưa đạt', async () => {
    expect(ids(await runChecklist(db, await ws(false, 'ok'), 'p0_reports')).accounts_confirmed).toBe(false);
    expect(ids(await runChecklist(db, await ws(true, 'warning'), 'p0_reports')).reconciliation_ok_7d).toBe(false);
    expect(ids(await runChecklist(db, await ws(true, null), 'p0_reports')).reconciliation_ok_7d).toBe(false);
    const id = await ws(true, 'ok');
    await openIncident(db, {
      kind: 'x',
      severity: 'P1',
      source: 'test',
      title: 't',
      fingerprint: 'f',
      workspaceId: id,
    });
    expect(ids(await runChecklist(db, id, 'p0_reports')).no_open_p1).toBe(false);
  });

  it('p1 cần p0 đang bật (phụ thuộc)', async () => {
    const id = await ws(true, 'ok');
    expect(ids(await runChecklist(db, id, 'p1_recommendations')).parent_enabled).toBe(false);
  });
});

describe('ma trận admin (AD01)', () => {
  it('liệt kê mọi workspace + owner + số tài khoản + trạng thái cờ; tìm theo tên', async () => {
    const a = await ws(true, 'ok');
    await ws(true, null);
    await db.insert(schema.featureFlags).values({ workspaceId: a, flagKey: 'p0_reports', enabled: true });
    const rows = await adminWorkspaceMatrix(db);
    expect(rows).toHaveLength(2);
    const row = rows.find((r) => r.id === a)!;
    expect(row).toMatchObject({ accounts: 1, flags: { p0_reports: { enabled: true } } });
    expect(row.ownerEmail).toMatch(/@/);
    const [w] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, a));
    expect((await adminWorkspaceMatrix(db, { q: w!.name.slice(0, 6) })).length).toBeGreaterThan(0);
  });
});
