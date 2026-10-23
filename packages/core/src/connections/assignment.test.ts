import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '@adxlens/db';
import {
  closeTestDb,
  seedAdAccount,
  seedClient,
  seedConnection,
  seedMember,
  seedWorkspace,
  testDb,
  truncateAll,
} from '@adxlens/db/testing';
import { resolveActor } from '@adxlens/core/tenancy';
import {
  archiveClientAndRelease,
  assignAdAccount,
  listAdAccounts,
  listClientOverview,
  unassignAdAccount,
  unconfirmedCount,
} from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());

async function setup() {
  const { workspace, owner } = await seedWorkspace(db);
  const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
  const conn = await seedConnection(db, workspace.id, owner.id);
  const acc = await seedAdAccount(db, workspace.id, conn.id, { name: 'Thời trang Linh 01' });
  return { ctx, acc, ws: workspace.id };
}

describe('gán tài khoản QC cho Client (S05)', () => {
  it('gán Client có sẵn → confirmed; đếm chưa xác nhận giảm', async () => {
    const { ctx, acc, ws } = await setup();
    const client = await seedClient(db, ws, 'Thời trang Linh');
    expect(await unconfirmedCount(ctx)).toBe(1);
    const r = await assignAdAccount(ctx, acc.id, { clientId: client.id });
    expect(r).toMatchObject({ clientId: client.id, assignmentStatus: 'confirmed' });
    expect(await unconfirmedCount(ctx)).toBe(0);
  });

  it('tài khoản của kết nối đã ngắt (chờ xóa) không hiện để gán, không tính vào chưa xác nhận', async () => {
    const { ctx, acc, ws } = await setup();
    const old = await seedConnection(db, ws, ctx.actor.userId);
    const gone = await seedAdAccount(db, ws, old.id, { name: 'Cà phê Nhà Rang' });
    await db.update(schema.metaConnections).set({ status: 'revoked' }).where(eq(schema.metaConnections.id, old.id));

    expect((await listAdAccounts(ctx)).map((a) => a.id)).toEqual([acc.id]);
    expect(await unconfirmedCount(ctx)).toBe(1);
    // Nhật ký hành động / breaker vẫn cần tên tài khoản cũ.
    expect((await listAdAccounts(ctx, { includeRevoked: true })).map((a) => a.id).sort()).toEqual(
      [acc.id, gone.id].sort(),
    );
  });

  it('tạo Client mới khi gán', async () => {
    const { ctx, acc } = await setup();
    const r = await assignAdAccount(ctx, acc.id, { createClientName: 'Thời trang Linh' });
    const [row] = await listAdAccounts(ctx);
    expect(row).toMatchObject({ clientName: 'Thời trang Linh', assignmentStatus: 'confirmed' });
    expect(r.clientId).toBeTruthy();
  });

  it('đã xác nhận cho Client khác → 409; bỏ gán rồi gán lại được', async () => {
    const { ctx, acc, ws } = await setup();
    const c1 = await seedClient(db, ws, 'A');
    const c2 = await seedClient(db, ws, 'B');
    await assignAdAccount(ctx, acc.id, { clientId: c1.id });
    await expect(assignAdAccount(ctx, acc.id, { clientId: c2.id })).rejects.toMatchObject({ code: 'CONFLICT' });
    await unassignAdAccount(ctx, acc.id);
    expect((await listAdAccounts(ctx))[0]).toMatchObject({ clientId: null, assignmentStatus: 'suggested' });
    await assignAdAccount(ctx, acc.id, { clientId: c2.id });
  });

  it('không gán vào Client của workspace khác', async () => {
    const { ctx, acc } = await setup();
    const other = await seedWorkspace(db);
    const foreign = await seedClient(db, other.workspace.id, 'X');
    await expect(assignAdAccount(ctx, acc.id, { clientId: foreign.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('buyer không gán được', async () => {
    const { ctx, acc, ws } = await setup();
    const client = await seedClient(db, ws, 'A');
    const buyer = await seedMember(db, ws, 'buyer', [client.id]);
    const bctx = { ...ctx, actor: (await resolveActor(db, ws, buyer.id))! };
    await expect(assignAdAccount(bctx, acc.id, { clientId: client.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('lưu trữ Client trả tài khoản về chưa gán; tổng quan C01 không còn Client đó', async () => {
    const { ctx, acc, ws } = await setup();
    const client = await seedClient(db, ws, 'A');
    await assignAdAccount(ctx, acc.id, { clientId: client.id });
    const ov = await listClientOverview(ctx);
    expect(ov).toHaveLength(1);
    expect(ov[0]!.accounts.map((a) => a.id)).toEqual([acc.id]);
    await archiveClientAndRelease(ctx, client.id);
    expect(await listClientOverview(ctx)).toEqual([]);
    expect((await listAdAccounts(ctx))[0]).toMatchObject({ clientId: null, assignmentStatus: 'suggested' });
  });

  it('buyer chỉ thấy Client được gán trong tổng quan', async () => {
    const { ctx, acc, ws } = await setup();
    const mine = await seedClient(db, ws, 'Của tôi');
    await seedClient(db, ws, 'Không phải của tôi');
    await assignAdAccount(ctx, acc.id, { clientId: mine.id });
    const buyer = await seedMember(db, ws, 'buyer', [mine.id]);
    const bctx = { ...ctx, actor: (await resolveActor(db, ws, buyer.id))! };
    const ov = await listClientOverview(bctx);
    expect(ov.map((c) => c.name)).toEqual(['Của tôi']);
    expect(ov[0]!.accounts).toHaveLength(1);
  });
});
