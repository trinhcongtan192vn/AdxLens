import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveActor } from '@adxlens/core/tenancy';
import { closeTestDb, seedMember, seedUser, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { asUser, call, installTestServer, uninstallTestServer } from '../../../test-utils';
import * as inviteRoute from './members/invitations/route';
import * as resendRoute from './members/invitations/[id]/resend/route';
import * as memberRoute from './members/[userId]/route';
import * as transferRoute from './members/[userId]/transfer-ownership/route';
import * as passwordRoute from './me/password/route';
import * as logoRoute from './workspace/logo/route';
import * as wsRoute from './workspace/route';
import * as workspacesRoute from './workspaces/route';

const db = testDb();
let server: ReturnType<typeof installTestServer>;
beforeEach(async () => {
  await truncateAll(db);
  server = installTestServer(db);
});
afterEach(() => uninstallTestServer());
afterAll(() => closeTestDb());

async function setup() {
  const { workspace, owner } = await seedWorkspace(db, 'Agency Sao Mai');
  return { ws: workspace.id, owner: asUser(owner) };
}

describe('mời thành viên (ST02)', () => {
  it('owner mời → email chứa link /invite/<token>; DB chỉ lưu hash', async () => {
    const { ws, owner } = await setup();
    const r = await call(inviteRoute.POST, {
      user: owner,
      workspaceId: ws,
      body: { email: 'Moi@SaoMai.vn', role: 'buyer' },
    });
    expect(r.status).toBe(201);
    const mail = server.email.sent[0]!;
    expect(mail.to).toBe('moi@saomai.vn');
    const token = mail.text.match(/\/invite\/([\w-]+)/)?.[1];
    expect(token).toBeTruthy();
    const rows = await db.execute(sql`select * from app.invitations`);
    expect(JSON.stringify(rows)).not.toContain(token!);
  });

  it('manager không mời được', async () => {
    const { ws } = await setup();
    const m = asUser(await seedMember(db, ws, 'manager'));
    const r = await call(inviteRoute.POST, { user: m, workspaceId: ws, body: { email: 'x@y.vn', role: 'buyer' } });
    expect(r.status).toBe(403);
    expect(server.email.sent).toHaveLength(0);
  });

  it('không mời với vai trò owner', async () => {
    const { ws, owner } = await setup();
    const r = await call(inviteRoute.POST, { user: owner, workspaceId: ws, body: { email: 'x@y.vn', role: 'owner' } });
    expect(r.status).toBe(422);
  });

  it('gửi lại tạo token mới, token cũ hết hiệu lực', async () => {
    const { ws, owner } = await setup();
    const created = await call(inviteRoute.POST, {
      user: owner,
      workspaceId: ws,
      body: { email: 'a@b.vn', role: 'manager' },
    });
    const id = (created.body as { id: string }).id;
    const r = await call(resendRoute.POST, { user: owner, workspaceId: ws, params: { id } });
    expect(r.status).toBe(200);
    const [first, second] = server.email.sent.map((m) => m.text.match(/\/invite\/([\w-]+)/)?.[1]);
    expect(first).not.toBe(second);
  });

  it('id sai định dạng → 404 (không phải 500)', async () => {
    const { ws, owner } = await setup();
    expect((await call(resendRoute.POST, { user: owner, workspaceId: ws, params: { id: 'abc' } })).status).toBe(404);
  });
});

describe('sửa thành viên và chuyển quyền', () => {
  it('owner đổi vai trò; không đổi được owner', async () => {
    const { ws, owner } = await setup();
    const m = await seedMember(db, ws, 'manager');
    expect(
      (
        await call(memberRoute.PATCH, {
          user: owner,
          workspaceId: ws,
          params: { userId: m.id },
          body: { role: 'buyer' },
        })
      ).status,
    ).toBe(204);
    expect((await resolveActor(db, ws, m.id))!.role).toBe('buyer');
    const r = await call(memberRoute.PATCH, {
      user: owner,
      workspaceId: ws,
      params: { userId: owner.id },
      body: { role: 'buyer' },
    });
    expect(r.status).toBe(409);
  });

  it('chuyển quyền owner cần đúng mật khẩu', async () => {
    const { ws, owner } = await setup();
    const m = await seedMember(db, ws, 'manager');
    const wrong = await call(transferRoute.POST, {
      user: owner,
      workspaceId: ws,
      params: { userId: m.id },
      body: { password: 'sai' },
    });
    expect(wrong.status).toBe(403);
    expect((await resolveActor(db, ws, owner.id))!.role).toBe('owner');
    const ok = await call(transferRoute.POST, {
      user: owner,
      workspaceId: ws,
      params: { userId: m.id },
      body: { password: 'correct-password' },
    });
    expect(ok.status).toBe(204);
    expect((await resolveActor(db, ws, m.id))!.role).toBe('owner');
  });
});

describe('workspace (ST01, A07)', () => {
  it('tạo workspace: người tạo là owner, đặt cookie workspace', async () => {
    const u = asUser(await seedUser(db));
    const r = await call(workspacesRoute.POST, {
      user: u,
      body: { name: 'Agency Mới', timezone: 'Asia/Ho_Chi_Minh', currency: 'VND' },
    });
    expect(r.status).toBe(201);
    const id = (r.body as { id: string }).id;
    expect((await resolveActor(db, id, u.id))!.role).toBe('owner');
    expect(r.headers.get('set-cookie')).toContain(`ws=${id}`);
  });

  it('múi giờ không hợp lệ bị từ chối', async () => {
    const u = asUser(await seedUser(db));
    const r = await call(workspacesRoute.POST, {
      user: u,
      body: { name: 'X', timezone: 'Mars/Base', currency: 'VND' },
    });
    expect(r.status).toBe(422);
  });

  it('sửa màu chủ đạo và email gửi báo cáo; màu sai định dạng bị từ chối', async () => {
    const { ws, owner } = await setup();
    expect(
      (
        await call(wsRoute.PATCH, {
          user: owner,
          workspaceId: ws,
          body: { primaryColor: '#4f46e5', reportFromEmail: 'BaoCao@SaoMai.vn' },
        })
      ).status,
    ).toBe(200);
    const got = await call(wsRoute.GET, { user: owner, workspaceId: ws });
    expect(got.body).toMatchObject({ brand: { primary_color: '#4F46E5' }, report_from_email: 'baocao@saomai.vn' });
    expect((await call(wsRoute.PATCH, { user: owner, workspaceId: ws, body: { primaryColor: 'red' } })).status).toBe(
      422,
    );
  });

  it('xóa workspace: chỉ owner, phải nhập đúng tên', async () => {
    const { ws, owner } = await setup();
    const m = asUser(await seedMember(db, ws, 'manager'));
    expect(
      (await call(wsRoute.DELETE, { user: m, workspaceId: ws, body: { confirmName: 'Agency Sao Mai' } })).status,
    ).toBe(403);
    expect((await call(wsRoute.DELETE, { user: owner, workspaceId: ws, body: { confirmName: 'sai' } })).status).toBe(
      422,
    );
    expect(
      (await call(wsRoute.DELETE, { user: owner, workspaceId: ws, body: { confirmName: 'Agency Sao Mai' } })).status,
    ).toBe(204);
    const left = await db.execute(sql`select id from app.workspaces where id = ${ws}`);
    expect(left).toHaveLength(0);
  });
});

describe('logo (ST01)', () => {
  async function upload(user: { id: string }, ws: string, bytes: Uint8Array, name: string) {
    const form = new FormData();
    form.set('file', new File([new Uint8Array(bytes)], name));
    const req = new Request('http://localhost/api/v1/workspace/logo', {
      method: 'POST',
      headers: { 'x-test-user': user.id, 'x-workspace-id': ws },
      body: form,
    });
    const res = await logoRoute.POST(req, { params: Promise.resolve({}) });
    return { status: res.status, body: await res.json().catch(() => null) };
  }

  it('nhận PNG, lưu vào bucket brand', async () => {
    const { ws, owner } = await setup();
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    const r = await upload(owner, ws, png, 'logo.png');
    expect(r.status).toBe(200);
    expect([...server.storage.files.keys()][0]).toMatch(new RegExp(`^brand/${ws}/logo-\\d+\\.png$`));
  });

  it('từ chối file không phải ảnh dù đặt đuôi .png, và SVG có script', async () => {
    const { ws, owner } = await setup();
    expect((await upload(owner, ws, new TextEncoder().encode('<html>'), 'x.png')).status).toBe(422);
    expect((await upload(owner, ws, new TextEncoder().encode('<svg><script>1</script></svg>'), 'x.svg')).status).toBe(
      422,
    );
    expect(server.storage.files.size).toBe(0);
  });

  it('file quá 1MB bị từ chối', async () => {
    const { ws, owner } = await setup();
    const big = new Uint8Array(1024 * 1024 + 1);
    big.set([0x89, 0x50, 0x4e, 0x47]);
    expect((await upload(owner, ws, big, 'big.png')).status).toBe(422);
  });
});

describe('đổi mật khẩu (ST06)', () => {
  it('cần đúng mật khẩu hiện tại và mật khẩu mới ≥ 10 ký tự', async () => {
    const u = asUser(await seedUser(db));
    const body = { currentPassword: 'sai', password: 'mat-khau-moi-10', confirm: 'mat-khau-moi-10' };
    expect((await call(passwordRoute.POST, { user: u, body })).status).toBe(403);
    expect(
      (
        await call(passwordRoute.POST, {
          user: u,
          body: { ...body, currentPassword: 'correct-password', password: 'ngan', confirm: 'ngan' },
        })
      ).status,
    ).toBe(422);
    expect(
      (await call(passwordRoute.POST, { user: u, body: { ...body, currentPassword: 'correct-password' } })).status,
    ).toBe(204);
  });
});
