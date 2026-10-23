import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  closeTestDb,
  seedAdAccount,
  seedConnection,
  seedMember,
  seedWorkspace,
  testDb,
  truncateAll,
} from '@adxlens/db/testing';
import { adminWorkspaceDetail, searchWorkspaces } from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());

describe('tra cứu workspace (admin, ADR-0013)', () => {
  it('tìm theo tên workspace hoặc email thành viên', async () => {
    const a = await seedWorkspace(db, 'Agency Sao Mai');
    const b = await seedWorkspace(db, 'Agency Biển Xanh');
    const buyer = await seedMember(db, b.workspace.id, 'buyer');
    expect((await searchWorkspaces(db, 'sao mai')).map((w) => w.id)).toEqual([a.workspace.id]);
    expect((await searchWorkspaces(db, buyer.email.slice(0, 10))).map((w) => w.id)).toEqual([b.workspace.id]);
    const all = await searchWorkspaces(db, '');
    expect(all.map((w) => w.id).sort()).toEqual([a.workspace.id, b.workspace.id].sort());
    expect(all.find((w) => w.id === b.workspace.id)).toMatchObject({ ownerEmail: b.owner.email, members: 2 });
  });

  it('chi tiết: gói, thành viên, kết nối (không token), tài khoản, cờ; workspace lạ → 404', async () => {
    const { workspace, owner } = await seedWorkspace(db);
    const conn = await seedConnection(db, workspace.id, owner.id);
    await seedAdAccount(db, workspace.id, conn.id, { name: 'Cà phê Nhà Rang' });
    const d = await adminWorkspaceDetail(db, workspace.id);
    expect(d.billing).toMatchObject({ plan: 'free', accountLimit: 1 });
    expect(d.members).toEqual([expect.objectContaining({ email: owner.email, role: 'owner' })]);
    expect(d.connections).toHaveLength(1);
    expect(d.accounts).toEqual([
      expect.objectContaining({
        name: 'Cà phê Nhà Rang',
        reconciliation30d: { lastCheckedAt: null, warnings: 0, days: 0 },
      }),
    ]);
    // Không bao giờ trả token (CLAUDE.md quy tắc 2).
    const json = JSON.stringify(d);
    expect(json).not.toMatch(/token_?ciphertext|tokenCiphertext|tokenKeyVersion/i);
    await expect(adminWorkspaceDetail(db, '00000000-0000-0000-0000-000000000000')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
