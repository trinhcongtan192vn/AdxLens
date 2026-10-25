import { afterAll, beforeEach, describe, expect, it } from 'vitest';
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
import { createBusinessLink, listBusinessLinks, publicBusiness, recordBusinessView, revokeBusinessLink } from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());
// 10:00 giờ VN ngày 25/10/2026 → hôm qua = 24/10.
const clock = { now: () => new Date('2026-10-25T03:00:00Z') };

async function setup() {
  const { workspace, owner } = await seedWorkspace(db);
  const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
  const client = await seedClient(db, workspace.id, 'Khách Sao Mai');
  const conn = await seedConnection(db, workspace.id, owner.id, '1001');
  const acc = await seedAdAccount(db, workspace.id, conn.id, { clientId: client.id, confirmed: true });
  return { ctx, wctx: { db, workspaceId: workspace.id }, workspaceId: workspace.id, client, acc };
}

describe('link Business công khai (ADR-0028)', () => {
  it('tạo theo Client; trang công khai: số liệu 30 ngày tới hôm qua; mật khẩu; thu hồi; buyer không tạo được', async () => {
    const s = await setup();
    const buyer = await seedMember(db, s.workspaceId, 'buyer');
    const bctx = { ...s.ctx, actor: (await resolveActor(db, s.workspaceId, buyer.id))! };
    await expect(createBusinessLink(bctx, { clientId: s.client.id, periodDays: 30 }, clock)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(
      createBusinessLink(s.ctx, { clientId: s.client.id, periodDays: 30, password: '123' }, clock),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });

    const link = await createBusinessLink(s.ctx, { clientId: s.client.id, periodDays: 30 }, clock);
    expect(link.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const ok = await publicBusiness(s.wctx, link, { unlocked: false, clock });
    expect(ok).toMatchObject({
      state: 'ok',
      clientName: 'Khách Sao Mai',
      range: { from: '2026-09-25', to: '2026-10-24' },
      currency: 'VND',
      accounts: [{ id: s.acc.id }],
    });
    await recordBusinessView(s.wctx, link.id, clock);
    expect((await listBusinessLinks(s.ctx))[0]).toMatchObject({ viewCount: 1 });

    const locked = await createBusinessLink(
      s.ctx,
      { clientId: s.client.id, periodDays: 7, password: 'mat-khau' },
      clock,
    );
    expect(await publicBusiness(s.wctx, locked, { unlocked: false, clock })).toEqual({
      state: 'password',
      linkId: locked.id,
    });
    expect((await publicBusiness(s.wctx, locked, { unlocked: true, clock })).state).toBe('ok');

    await revokeBusinessLink(s.ctx, link.id, clock);
    const [revoked] = (await listBusinessLinks(s.ctx)).filter((l) => l.id === link.id);
    expect(await publicBusiness(s.wctx, revoked!, { unlocked: false, clock })).toEqual({ state: 'revoked' });
  });

  it('khóa (không hiện số) khi đối chiếu lệch trong kỳ hoặc tài khoản chưa xác nhận; hết hạn', async () => {
    const s = await setup();
    const link = await createBusinessLink(s.ctx, { clientId: s.client.id, periodDays: 7, expiresInDays: 7 }, clock);
    await db.insert(schema.reconciliationResults).values({
      workspaceId: s.workspaceId,
      adAccountId: s.acc.id,
      date: '2026-10-22',
      spendInternal: '100',
      spendMeta: '102',
      resultsInternal: 1,
      resultsMeta: 1,
      spendDeltaPct: '0.02',
      resultsDeltaPct: '0',
      status: 'warning',
    });
    expect(await publicBusiness(s.wctx, link, { unlocked: false, clock })).toEqual({ state: 'locked' });
    // Ngày lệch nằm ngoài kỳ 7 ngày (sau 7 ngày nữa) → mở lại; nhưng link đã hết hạn.
    const later = { now: () => new Date('2026-11-05T03:00:00Z') };
    expect(await publicBusiness(s.wctx, link, { unlocked: false, clock: later })).toEqual({ state: 'expired' });

    const other = await setup();
    const conn = await seedConnection(db, other.workspaceId, other.ctx.actor.userId, '2002');
    await seedAdAccount(db, other.workspaceId, conn.id, { clientId: other.client.id, confirmed: false });
    const l2 = await createBusinessLink(other.ctx, { clientId: other.client.id, periodDays: 30 }, clock);
    expect(await publicBusiness(other.wctx, l2, { unlocked: false, clock })).toEqual({ state: 'locked' });
  });
});
