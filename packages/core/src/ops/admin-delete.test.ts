import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@adxlens/db';
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
import { adminDeleteUser, adminDeleteWorkspace, listAdminAudit } from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());

/** Workspace có dữ liệu ở nhiều bảng (kể cả bảng không cascade theo workspace và analytics). */
async function richWorkspace(name: string) {
  const { workspace, owner } = await seedWorkspace(db, name);
  const buyer = await seedMember(db, workspace.id, 'buyer');
  const conn = await seedConnection(db, workspace.id, owner.id, '1001');
  const [client] = await db.insert(schema.clients).values({ workspaceId: workspace.id, name: 'Khách' }).returning();
  const acc = await seedAdAccount(db, workspace.id, conn.id, { clientId: client!.id });
  await db.execute(sql`insert into analytics.entities (workspace_id, ad_account_id, entity_type, meta_id, name)
    values (${workspace.id}, ${acc.id}, 'campaign', '9001', 'C')`);
  await db.insert(schema.notifications).values({
    workspaceId: workspace.id,
    userId: owner.id,
    kind: 'action_executed',
    params: {},
  } as never);
  return { workspace, owner, buyer, accId: acc.id };
}

const count = async (table: string, workspaceId: string) =>
  Number(
    (
      await db.execute<{ n: string }>(
        sql`select count(*)::text as n from ${sql.raw(table)} where workspace_id = ${workspaceId}`,
      )
    )[0]!.n,
  );

describe('admin xóa workspace / tài khoản', () => {
  it('superadmin xóa workspace: gõ đúng tên; xóa mọi bảng có workspace_id; workspace khác không bị đụng; có nhật ký', async () => {
    const a = await richWorkspace('Agency A');
    const b = await richWorkspace('Agency B');
    const pm = await seedStaff(db, true);
    const op = await seedStaff(db, false);
    const sa = { userId: pm.id, role: 'superadmin' as const };
    const input = { workspaceId: a.workspace.id, confirmName: 'Agency A', reason: 'Khách yêu cầu xóa' };

    await expect(adminDeleteWorkspace(db, { userId: op.id, role: 'operator' }, input)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(adminDeleteWorkspace(db, sa, { ...input, confirmName: 'Agency' })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    await expect(adminDeleteWorkspace(db, sa, { ...input, reason: 'x' })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });

    await adminDeleteWorkspace(db, sa, input);
    for (const t of [
      'app.memberships',
      'app.meta_connections',
      'app.ad_accounts',
      'app.clients',
      'analytics.entities',
    ]) {
      expect(await count(t, a.workspace.id)).toBe(0);
      expect(await count(t, b.workspace.id)).toBeGreaterThan(0);
    }
    expect(await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, a.workspace.id))).toEqual([]);
    const [log] = await listAdminAudit(db, { action: 'workspace.deleted' });
    expect(log).toMatchObject({ targetId: a.workspace.id, reason: 'Khách yêu cầu xóa', detail: { name: 'Agency A' } });
    // Tài khoản đăng nhập của thành viên vẫn còn.
    expect(await db.select().from(schema.users).where(eq(schema.users.id, a.buyer.id))).toHaveLength(1);
  });

  it('xóa tài khoản: gõ đúng email; chặn tự xóa, staff, Owner; xóa thành viên + đăng nhập; có nhật ký', async () => {
    const a = await richWorkspace('Agency A');
    const pm = await seedStaff(db, true);
    const op = await seedStaff(db, false);
    const sa = { userId: pm.id, role: 'superadmin' as const };
    const deleted: string[] = [];
    const deps = { deleteLogin: async (id: string) => void deleted.push(id) };
    const why = 'Tài khoản rác';

    await expect(
      adminDeleteUser(
        db,
        { userId: op.id, role: 'operator' },
        { userId: a.buyer.id, confirmEmail: a.buyer.email, reason: why },
        deps,
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      adminDeleteUser(db, sa, { userId: pm.id, confirmEmail: pm.email, reason: why }, deps),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      adminDeleteUser(db, sa, { userId: op.id, confirmEmail: op.email, reason: why }, deps),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      adminDeleteUser(db, sa, { userId: a.owner.id, confirmEmail: a.owner.email, reason: why }, deps),
    ).rejects.toMatchObject({ code: 'CONFLICT', details: { workspaces: ['Agency A'] } });
    await expect(
      adminDeleteUser(db, sa, { userId: a.buyer.id, confirmEmail: 'sai@test.local', reason: why }, deps),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(deleted).toEqual([]);

    await adminDeleteUser(db, sa, { userId: a.buyer.id, confirmEmail: a.buyer.email.toUpperCase(), reason: why }, deps);
    expect(deleted).toEqual([a.buyer.id]);
    expect(await db.select().from(schema.users).where(eq(schema.users.id, a.buyer.id))).toEqual([]);
    expect(await db.select().from(schema.memberships).where(eq(schema.memberships.userId, a.buyer.id))).toEqual([]);
    // Owner và workspace vẫn nguyên.
    expect(await count('app.memberships', a.workspace.id)).toBe(1);
    const [log] = await listAdminAudit(db, { action: 'user.deleted' });
    expect(log).toMatchObject({ targetId: a.buyer.id, detail: { email: a.buyer.email } });
  });
});
