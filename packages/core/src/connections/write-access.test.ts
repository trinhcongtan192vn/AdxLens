import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@adxlens/db';
import { closeTestDb, seedConnection, seedMember, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { resolveActor } from '@adxlens/core/tenancy';
import { connectionCanWrite, listWriteAccess, setWriteEnabled } from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());

async function setup(scopes = ['ads_read', 'ads_management']) {
  const { workspace, owner } = await seedWorkspace(db);
  const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
  const conn = await seedConnection(db, workspace.id, owner.id);
  await db.update(schema.metaConnections).set({ scopes }).where(eq(schema.metaConnections.id, conn.id));
  return { ctx, workspaceId: workspace.id, conn };
}

describe('quyền ghi theo kết nối (P201, P2-01)', () => {
  it('bật khi có scope ads_management; thu hồi có hiệu lực ngay', async () => {
    const { ctx, conn } = await setup();
    expect(await connectionCanWrite(ctx, conn.id)).toBe(false); // mặc định tắt
    await setWriteEnabled(ctx, conn.id, true);
    expect(await connectionCanWrite(ctx, conn.id)).toBe(true);
    expect(await listWriteAccess(ctx)).toEqual([
      expect.objectContaining({ id: conn.id, hasWriteScope: true, writeEnabled: true }),
    ]);
    await setWriteEnabled(ctx, conn.id, false);
    expect(await connectionCanWrite(ctx, conn.id)).toBe(false);
  });

  it('không có scope ghi, kết nối mẫu hoặc đã thu hồi trên Meta → không bật được / không ghi được', async () => {
    const a = await setup(['ads_read']);
    await expect(setWriteEnabled(a.ctx, a.conn.id, true)).rejects.toMatchObject({ code: 'CONFLICT' });
    const b = await setup();
    await db.update(schema.metaConnections).set({ isDemo: true }).where(eq(schema.metaConnections.id, b.conn.id));
    await expect(setWriteEnabled(b.ctx, b.conn.id, true)).rejects.toMatchObject({ code: 'CONFLICT' });
    const c = await setup();
    await setWriteEnabled(c.ctx, c.conn.id, true);
    await db.update(schema.metaConnections).set({ status: 'revoked' }).where(eq(schema.metaConnections.id, c.conn.id));
    expect(await connectionCanWrite(c.ctx, c.conn.id)).toBe(false);
    // Kết nối lại chỉ với quyền đọc → scope ghi mất → không ghi được dù cờ còn bật.
    await db
      .update(schema.metaConnections)
      .set({ status: 'active', scopes: ['ads_read'] })
      .where(eq(schema.metaConnections.id, c.conn.id));
    expect(await connectionCanWrite(c.ctx, c.conn.id)).toBe(false);
  });

  it('chỉ Owner; không chạm kết nối của workspace khác', async () => {
    const { workspaceId, conn } = await setup();
    const m = await seedMember(db, workspaceId, 'manager');
    const mctx = { db, workspaceId, actor: (await resolveActor(db, workspaceId, m.id))! };
    await expect(setWriteEnabled(mctx, conn.id, true)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const other = await setup();
    await expect(setWriteEnabled(other.ctx, conn.id, true)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await connectionCanWrite(other.ctx, conn.id)).toBe(false);
  });
});
