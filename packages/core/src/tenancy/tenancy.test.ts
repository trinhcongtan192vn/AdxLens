import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeTestDb, seedClient, seedMember, seedUser, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { AppError, type Actor } from '@adxlens/core/shared';
import {
  acceptInvitation,
  archiveClient,
  createClient,
  createInvitation,
  createWorkspace,
  listClients,
  listMembers,
  listWorkspacesForUser,
  peekInvitation,
  removeMember,
  resolveActor,
  transferOwnership,
  updateMember,
  updateWorkspace,
} from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());

async function ownerCtx() {
  const { workspace, owner } = await seedWorkspace(db);
  const actor = (await resolveActor(db, workspace.id, owner.id))!;
  return { db, workspaceId: workspace.id, actor, owner, workspace };
}

const asActor = (ctx: { workspaceId: string }, actor: Actor) => ({
  db,
  workspaceId: ctx.workspaceId,
  actor,
});

describe('workspace', () => {
  it('người tạo thành owner và thấy workspace trong danh sách', async () => {
    const u = await seedUser(db);
    const ws = await createWorkspace(db, { name: '  Agency Sao Mai ', ownerUserId: u.id });
    expect(ws.name).toBe('Agency Sao Mai');
    expect(await listWorkspacesForUser(db, u.id)).toEqual([{ id: ws.id, name: 'Agency Sao Mai', role: 'owner' }]);
  });

  it('từ chối tên rỗng', async () => {
    const u = await seedUser(db);
    await expect(createWorkspace(db, { name: '  ', ownerUserId: u.id })).rejects.toThrow(AppError);
  });

  it('chỉ owner sửa được workspace', async () => {
    const ctx = await ownerCtx();
    await updateWorkspace(ctx, { name: 'Mới' });
    const m = await seedMember(db, ctx.workspaceId, 'manager');
    const managerActor = (await resolveActor(db, ctx.workspaceId, m.id))!;
    await expect(updateWorkspace(asActor(ctx, managerActor), { name: 'X' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('người ngoài workspace không có actor', async () => {
    const ctx = await ownerCtx();
    const other = await seedUser(db);
    expect(await resolveActor(db, ctx.workspaceId, other.id)).toBeNull();
  });
});

describe('thành viên và lời mời', () => {
  it('mời → chấp nhận → thành thành viên đúng vai trò', async () => {
    const ctx = await ownerCtx();
    const client = await seedClient(db, ctx.workspaceId);
    const { token } = await createInvitation(ctx, {
      email: 'Buyer@Agency.vn',
      role: 'buyer',
      clientAccess: [client.id],
    });
    expect(await peekInvitation(db, token)).toMatchObject({
      status: 'valid',
      email: 'buyer@agency.vn',
      role: 'buyer',
      clientNames: [client.name],
      allClients: false,
      inviterRole: 'owner',
      daysLeft: 7,
    });

    const buyer = await seedUser(db, 'buyer@agency.vn');
    await acceptInvitation(db, { token, userId: buyer.id, email: 'buyer@agency.vn' });
    const actor = await resolveActor(db, ctx.workspaceId, buyer.id);
    expect(actor).toMatchObject({ role: 'buyer', clientAccess: [client.id] });
    // Token dùng một lần.
    expect(await peekInvitation(db, token)).toEqual({ status: 'invalid' });
  });

  it('lời mời hết hạn không chấp nhận được', async () => {
    const ctx = await ownerCtx();
    const past = { now: () => new Date(Date.now() - 8 * 86_400_000) };
    const { token } = await createInvitation(ctx, { email: 'a@b.vn', role: 'manager' }, past);
    // A06 · hết hạn hiện tên workspace; không lộ gì khác (email, vai trò).
    expect(await peekInvitation(db, token)).toEqual({ status: 'expired', workspaceName: ctx.workspace.name });
    const u = await seedUser(db, 'a@b.vn');
    await expect(acceptInvitation(db, { token, userId: u.id, email: 'a@b.vn' })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('email đăng nhập khác email được mời thì từ chối', async () => {
    const ctx = await ownerCtx();
    const { token } = await createInvitation(ctx, { email: 'a@b.vn', role: 'manager' });
    const u = await seedUser(db, 'khac@b.vn');
    await expect(acceptInvitation(db, { token, userId: u.id, email: 'khac@b.vn' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('A06: buyer chưa gán Client thì không phải "tất cả Client"; manager không giới hạn thì là tất cả', async () => {
    const ctx = await ownerCtx();
    const b = await createInvitation(ctx, { email: 'b@x.vn', role: 'buyer' });
    const m = await createInvitation(ctx, { email: 'm@x.vn', role: 'manager' });
    expect(await peekInvitation(db, b.token)).toMatchObject({ allClients: false, clientNames: [] });
    expect(await peekInvitation(db, m.token)).toMatchObject({ allClients: true });
  });

  it('token sai không lộ thông tin', async () => {
    expect(await peekInvitation(db, 'khong-ton-tai')).toEqual({ status: 'invalid' });
  });

  it('không mời Client của workspace khác', async () => {
    const ctx = await ownerCtx();
    const other = await seedWorkspace(db);
    const foreign = await seedClient(db, other.workspace.id);
    await expect(
      createInvitation(ctx, { email: 'x@y.vn', role: 'buyer', clientAccess: [foreign.id] }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('manager không mời được; owner đổi vai trò và xóa thành viên', async () => {
    const ctx = await ownerCtx();
    const m = await seedMember(db, ctx.workspaceId, 'manager');
    const mActor = (await resolveActor(db, ctx.workspaceId, m.id))!;
    await expect(createInvitation(asActor(ctx, mActor), { email: 'x@y.vn', role: 'buyer' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await updateMember(ctx, m.id, { role: 'buyer' });
    expect((await resolveActor(db, ctx.workspaceId, m.id))!.role).toBe('buyer');
    await removeMember(ctx, m.id);
    expect(await resolveActor(db, ctx.workspaceId, m.id)).toBeNull();
    await expect(removeMember(ctx, ctx.owner.id)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('listMembers chỉ trả thành viên của workspace mình', async () => {
    const ctx = await ownerCtx();
    const other = await seedWorkspace(db);
    await seedMember(db, other.workspace.id, 'buyer');
    const members = await listMembers(ctx);
    expect(members.map((m) => m.userId)).toEqual([ctx.owner.id]);
  });
});

describe('chuyển quyền owner (ADR-0001 B8)', () => {
  it('owner chuyển cho manager; owner cũ thành manager', async () => {
    const ctx = await ownerCtx();
    const m = await seedMember(db, ctx.workspaceId, 'manager');
    await transferOwnership(ctx, m.id);
    expect((await resolveActor(db, ctx.workspaceId, m.id))!.role).toBe('owner');
    expect((await resolveActor(db, ctx.workspaceId, ctx.owner.id))!.role).toBe('manager');
  });

  it('không chuyển cho buyer', async () => {
    const ctx = await ownerCtx();
    const b = await seedMember(db, ctx.workspaceId, 'buyer');
    await expect(transferOwnership(ctx, b.id)).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('Client', () => {
  it('buyer chỉ thấy Client được gán; Client lưu trữ bị ẩn', async () => {
    const ctx = await ownerCtx();
    const c1 = await createClient(ctx, { name: 'ABC Shop' });
    const c2 = await createClient(ctx, { name: 'Lumi Spa' });
    const b = await seedMember(db, ctx.workspaceId, 'buyer', [c1.id]);
    const bActor = (await resolveActor(db, ctx.workspaceId, b.id))!;
    expect((await listClients(asActor(ctx, bActor))).map((c) => c.id)).toEqual([c1.id]);
    await archiveClient(ctx, c2.id);
    expect((await listClients(ctx)).map((c) => c.name)).toEqual(['ABC Shop']);
  });

  it('không thấy Client của workspace khác', async () => {
    const ctx = await ownerCtx();
    const other = await ownerCtx();
    await createClient(other, { name: 'Khác' });
    expect(await listClients(ctx)).toEqual([]);
  });
});
