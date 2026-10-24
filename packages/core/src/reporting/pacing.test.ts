import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
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
import { recordingEnqueue } from '@adxlens/jobs';
import { addDays } from '@adxlens/core/shared';
import { resolveActor } from '@adxlens/core/tenancy';
import { clientPacing, runPacingAlerts, setClientBudget } from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());

// 11/10/2026 05:00 giờ VN → đã qua 10 ngày (1–10/10), tháng 31 ngày.
const clock = { now: () => new Date('2026-10-10T22:00:00Z') };

async function setup(dailySpend: number) {
  const { workspace, owner } = await seedWorkspace(db);
  const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
  const conn = await seedConnection(db, workspace.id, owner.id);
  const client = await seedClient(db, workspace.id, 'Cà phê Nhà Rang');
  const acc = await seedAdAccount(db, workspace.id, conn.id, { clientId: client.id, confirmed: true });
  await db.insert(schema.insightsDaily).values(
    Array.from({ length: 10 }, (_, i) => ({
      workspaceId: workspace.id,
      adAccountId: acc.id,
      entityType: 'ad' as const,
      metaId: 'ad1',
      adsetId: 'as1',
      date: addDays('2026-10-01', i),
      spend: String(dailySpend),
      impressions: 1000,
      linkClicks: 10,
      clicks: 10,
      results: 1,
      attributionWindow: '7d_click_1d_view',
    })),
  );
  // Ngày tháng trước không được tính.
  await db.insert(schema.insightsDaily).values({
    workspaceId: workspace.id,
    adAccountId: acc.id,
    entityType: 'ad' as const,
    metaId: 'ad1',
    adsetId: 'as1',
    date: '2026-09-30',
    spend: '9999999',
    impressions: 1,
    linkClicks: 0,
    clicks: 0,
    results: 0,
    attributionWindow: '7d_click_1d_view',
  });
  return { ctx, client, owner };
}

describe('ngân sách tháng theo Client (A3)', () => {
  it('chi từ đầu tháng tới hôm qua, dự kiến cả tháng, trạng thái ±10%, mức chi mỗi ngày còn lại', async () => {
    const { ctx, client } = await setup(100_000);
    expect(await clientPacing(ctx, client.id, clock)).toBeNull();
    await setClientBudget(ctx, { clientId: client.id, month: '2026-10', amount: '3100000', currency: 'VND' });
    const p = (await clientPacing(ctx, client.id, clock))!;
    expect(p).toMatchObject({
      month: '2026-10',
      daysElapsed: 10,
      daysInMonth: 31,
      status: 'on_track',
      projectedPct: 0,
    });
    expect(Number(p.spent)).toBe(1_000_000);
    expect(Number(p.projected)).toBe(3_100_000);
    expect(Number(p.dailyNeeded)).toBe(100_000);

    await setClientBudget(ctx, { clientId: client.id, month: '2026-10', amount: '2000000', currency: 'VND' });
    expect((await clientPacing(ctx, client.id, clock))!.status).toBe('over');
    await setClientBudget(ctx, { clientId: client.id, month: '2026-10', amount: '5000000', currency: 'VND' });
    expect((await clientPacing(ctx, client.id, clock))!.status).toBe('under');
  });

  it('kiểm đầu vào: số dương, tháng YYYY-MM, tiền tệ trùng tài khoản; buyer không đặt được', async () => {
    const { ctx, client } = await setup(100_000);
    const base = { clientId: client.id, month: '2026-10', amount: '1000000', currency: 'VND' };
    await expect(setClientBudget(ctx, { ...base, amount: '0' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(setClientBudget(ctx, { ...base, amount: '1e6' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(setClientBudget(ctx, { ...base, month: '2026-13' })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    await expect(setClientBudget(ctx, { ...base, currency: 'USD' })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    const buyer = { ...ctx, actor: { ...ctx.actor, role: 'buyer' as const } };
    await expect(setClientBudget(buyer, base)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('cảnh báo một lần mỗi trạng thái trong tháng; về đúng tiến độ thì đặt lại', async () => {
    const { ctx, client } = await setup(100_000);
    await setClientBudget(ctx, { clientId: client.id, month: '2026-10', amount: '2000000', currency: 'VND' });
    const enqueue = recordingEnqueue();
    expect(await runPacingAlerts(ctx, { enqueue, clock })).toEqual({ checked: 1, alerted: 1 });
    expect(await runPacingAlerts(ctx, { enqueue, clock })).toEqual({ checked: 1, alerted: 0 });
    const notes = await db.select().from(schema.notifications).where(eq(schema.notifications.kind, 'budget_pacing'));
    expect(notes).toHaveLength(1);
    expect(notes[0]!.params).toMatchObject({ client: 'Cà phê Nhà Rang', status: 'over' });

    // Sửa ngân sách → đặt lại trạng thái cảnh báo; đúng tiến độ thì không cảnh báo.
    await setClientBudget(ctx, { clientId: client.id, month: '2026-10', amount: '3100000', currency: 'VND' });
    expect(await runPacingAlerts(ctx, { enqueue, clock })).toEqual({ checked: 1, alerted: 0 });
  });

  it('dưới 5 ngày đầu tháng chưa cảnh báo', async () => {
    const { ctx, client } = await setup(100_000);
    await setClientBudget(ctx, { clientId: client.id, month: '2026-10', amount: '500000', currency: 'VND' });
    const early = { now: () => new Date('2026-10-03T22:00:00Z') }; // 4/10 giờ VN → 3 ngày
    expect(await runPacingAlerts(ctx, { clock: early })).toEqual({ checked: 1, alerted: 0 });
  });
});
