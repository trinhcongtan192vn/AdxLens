import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import { closeTestDb, seedAdAccount, seedConnection, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { reconciliationBoard } from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());

const NOW = new Date('2026-10-23T05:00:00Z');
const clock = { now: () => NOW };

async function recon(workspaceId: string, adAccountId: string, date: string, status: 'ok' | 'warning', pct: string) {
  await db.insert(schema.reconciliationResults).values({
    workspaceId,
    adAccountId,
    date,
    spendInternal: '100',
    spendMeta: '100',
    resultsInternal: 1,
    resultsMeta: 1,
    spendDeltaPct: pct,
    resultsDeltaPct: '0',
    status,
    checkedAt: NOW,
  });
}

describe('bảng đối chiếu toàn hệ thống (admin)', () => {
  it('đếm ngày lệch trong kỳ, độ lệch lớn nhất dạng decimal, chặn chia sẻ như ADR-0007', async () => {
    const { workspace, owner } = await seedWorkspace(db, 'Agency Đối chiếu');
    const conn = await seedConnection(db, workspace.id, owner.id);
    const lag = await seedAdAccount(db, workspace.id, conn.id, { name: 'Thời trang Linh' });
    const ok = await seedAdAccount(db, workspace.id, conn.id, { name: 'Cà phê Nhà Rang' });
    await db
      .update(schema.adAccounts)
      .set({ assignmentStatus: 'confirmed' })
      .where(eq(schema.adAccounts.workspaceId, workspace.id));
    await recon(workspace.id, lag.id, '2026-10-20', 'warning', '-1.400000');
    await recon(workspace.id, lag.id, '2026-10-21', 'ok', '0.200000');
    await recon(workspace.id, lag.id, '2026-09-01', 'warning', '5.000000'); // ngoài kỳ 7 ngày
    await recon(workspace.id, ok.id, '2026-10-21', 'ok', '0.100000');

    const rows = await reconciliationBoard(db, { days: 7 }, clock);
    expect(rows.map((r) => r.accountName)).toEqual(['Thời trang Linh', 'Cà phê Nhà Rang']);
    expect(rows[0]).toMatchObject({
      workspaceName: 'Agency Đối chiếu',
      daysChecked: 2,
      warningDays: 1,
      warningDates: ['2026-10-20'],
      maxSpendDeltaPct: '1.400000',
      shareBlocked: true,
      stale: false,
    });
    expect(rows[1]).toMatchObject({ warningDays: 0, shareBlocked: false });

    // Chỉ vấn đề: bỏ tài khoản khớp và đối chiếu mới.
    expect((await reconciliationBoard(db, { days: 7, onlyIssues: true }, clock)).map((r) => r.accountName)).toEqual([
      'Thời trang Linh',
    ]);
  });

  it('gán chưa xác nhận → chặn chia sẻ; chưa đối chiếu → trễ; bỏ kết nối đã ngắt và dữ liệu mẫu', async () => {
    const { workspace, owner } = await seedWorkspace(db);
    const conn = await seedConnection(db, workspace.id, owner.id);
    await seedAdAccount(db, workspace.id, conn.id, { name: 'Mới gán' });
    const [r] = await reconciliationBoard(db, {}, clock);
    expect(r).toMatchObject({ shareBlocked: true, stale: true, daysChecked: 0, maxSpendDeltaPct: null });

    await db.update(schema.metaConnections).set({ isDemo: true }).where(eq(schema.metaConnections.id, conn.id));
    expect(await reconciliationBoard(db, {}, clock)).toEqual([]);
    await db
      .update(schema.metaConnections)
      .set({ isDemo: false, status: 'revoked' })
      .where(eq(schema.metaConnections.id, conn.id));
    expect(await reconciliationBoard(db, {}, clock)).toEqual([]);
  });
});
