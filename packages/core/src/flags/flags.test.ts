import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeTestDb, seedStaff, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
import { setSubscription } from '@adxlens/core/billing';
import { resolveActor } from '@adxlens/core/tenancy';
import {
  assertEnabled,
  dependentsOf,
  disableFlag,
  enableFlag,
  flagHistory,
  getFlags,
  isEnabled,
  memoryFlagCache,
  onFlagDisabled,
  registerFlagCheck,
  resetFlagRegistry,
  setFlagCache,
  clearFlagOverride,
  flagScopeHistory,
  readFlagScopes,
  setGlobalFlag,
  setPlanFlag,
} from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterEach(() => {
  resetFlagRegistry();
  setFlagCache(null);
});
afterAll(() => closeTestDb());

async function setup() {
  const { workspace } = await seedWorkspace(db);
  const pm = await seedStaff(db, true);
  const support = await seedStaff(db, false);
  return {
    ws: workspace.id,
    pm: pm.id,
    support: support.id,
    ctx: { db, workspaceId: workspace.id },
  };
}

describe('mặc định', () => {
  it('mọi cờ tắt khi chưa có bản ghi', async () => {
    const { ctx } = await setup();
    expect(await getFlags(ctx)).toEqual({
      p0_reports: false,
      p1_recommendations: false,
      p2a_approve: false,
      p2b_auto: false,
    });
  });

  it('assertEnabled trả 404 không lộ tên cờ khi cờ tắt', async () => {
    const { ctx } = await setup();
    const err = await assertEnabled(ctx, 'p1_recommendations').catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'FEATURE_DISABLED', status: 404 });
    expect(JSON.stringify(err)).not.toContain('p1_recommendations');
    expect((err as Error).message).not.toContain('p1');
  });
});

describe('bật cờ', () => {
  it('chỉ staff có quyền PM bật được', async () => {
    const { ws, support } = await setup();
    await expect(
      enableFlag(db, {
        workspaceId: ws,
        key: 'p0_reports',
        staffUserId: support,
        reason: 'thử nghiệm',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('thành viên workspace (không phải staff) không bật được', async () => {
    const { workspace, owner } = await seedWorkspace(db);
    await expect(
      enableFlag(db, {
        workspaceId: workspace.id,
        key: 'p0_reports',
        staffUserId: owner.id,
        reason: 'tự bật',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('bắt buộc lý do', async () => {
    const { ws, pm } = await setup();
    await expect(
      enableFlag(db, { workspaceId: ws, key: 'p0_reports', staffUserId: pm, reason: ' ' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('bật và ghi nhật ký kèm checklist', async () => {
    const { ws, pm, ctx } = await setup();
    await enableFlag(db, {
      workspaceId: ws,
      key: 'p0_reports',
      staffUserId: pm,
      reason: 'design partner V0',
    });
    expect(await isEnabled(ctx, 'p0_reports')).toBe(true);
    const [log] = await flagHistory(db, ws);
    expect(log).toMatchObject({
      flagKey: 'p0_reports',
      oldValue: false,
      newValue: true,
      override: false,
    });
  });

  it('không bật cờ con khi cờ cha tắt, kể cả khi vượt checklist', async () => {
    const { ws, pm } = await setup();
    await expect(
      enableFlag(db, {
        workspaceId: ws,
        key: 'p1_recommendations',
        staffUserId: pm,
        reason: 'thử vượt',
        override: true,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('ADR-0024: checklist chưa đạt KHÔNG chặn nữa — vẫn bật (ngoại lệ) và ghi kết quả checklist vào nhật ký', async () => {
    const { ws, pm, ctx } = await setup();
    registerFlagCheck('p0_reports', {
      id: 'accounts_confirmed',
      label: 'Mọi tài khoản đã xác nhận gán',
      run: async () => ({ passed: false, detail: '1 tài khoản chưa xác nhận' }),
    });
    const r = await enableFlag(db, { workspaceId: ws, key: 'p0_reports', staffUserId: pm, reason: 'design partner' });
    expect(r.override).toBe(true);
    expect(await isEnabled(ctx, 'p0_reports')).toBe(true);
    const [log] = await flagHistory(db, ws);
    expect(log?.override).toBe(true);
    expect(log?.checklistResult).toContainEqual(expect.objectContaining({ id: 'accounts_confirmed', passed: false }));
  });

  it('kiểm tra ném lỗi được ghi là chưa đạt (không làm hỏng việc bật)', async () => {
    const { ws, pm } = await setup();
    registerFlagCheck('p0_reports', {
      id: 'boom',
      label: 'Lỗi',
      run: async () => {
        throw new Error('db down');
      },
    });
    await enableFlag(db, { workspaceId: ws, key: 'p0_reports', staffUserId: pm, reason: 'design partner' });
    const [log] = await flagHistory(db, ws);
    expect(log?.checklistResult).toContainEqual(expect.objectContaining({ id: 'boom', passed: false }));
  });
});

describe('tắt cờ', () => {
  it('mọi staff tắt được; tắt cờ cha tắt luôn cờ con và chạy handler', async () => {
    const { ws, pm, support, ctx } = await setup();
    for (const key of ['p0_reports', 'p1_recommendations', 'p2a_approve'] as const) {
      await enableFlag(db, { workspaceId: ws, key, staffUserId: pm, reason: 'bật để test' });
    }
    const cancelled: string[] = [];
    onFlagDisabled('p2a_approve', async (_db, workspaceId) => {
      cancelled.push(workspaceId);
    });
    const off = await disableFlag(db, {
      workspaceId: ws,
      key: 'p1_recommendations',
      staffUserId: support,
      reason: 'sự cố gợi ý',
    });
    expect(off).toEqual(['p1_recommendations', 'p2a_approve']);
    expect(await getFlags(ctx)).toMatchObject({
      p0_reports: true,
      p1_recommendations: false,
      p2a_approve: false,
    });
    expect(cancelled).toEqual([ws]);
  });

  it('người ngoài đội AdxLens không tắt được', async () => {
    const { workspace, owner } = await seedWorkspace(db);
    await expect(
      disableFlag(db, {
        workspaceId: workspace.id,
        key: 'p0_reports',
        staffUserId: owner.id,
        reason: 'tắt thử',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('cache', () => {
  it('đọc từ cache và xóa cache khi đổi cờ', async () => {
    const cache = memoryFlagCache();
    setFlagCache(cache);
    const { ws, pm, ctx } = await setup();
    expect(await isEnabled(ctx, 'p0_reports')).toBe(false);
    expect(cache.store.get(`flag:${ws}:p0_reports`)).toBe(false);
    await enableFlag(db, {
      workspaceId: ws,
      key: 'p0_reports',
      staffUserId: pm,
      reason: 'design partner',
    });
    expect(cache.store.has(`flag:${ws}:p0_reports`)).toBe(false);
    expect(await isEnabled(ctx, 'p0_reports')).toBe(true);
  });
});

describe('cách ly workspace', () => {
  it('bật cờ cho workspace A không ảnh hưởng B', async () => {
    const a = await setup();
    const b = await seedWorkspace(db);
    await enableFlag(db, {
      workspaceId: a.ws,
      key: 'p0_reports',
      staffUserId: a.pm,
      reason: 'chỉ A',
    });
    expect(await isEnabled({ db, workspaceId: b.workspace.id }, 'p0_reports')).toBe(false);
  });
});

it('nhật ký cờ là append-only ở mức database', async () => {
  const { ws, pm } = await setup();
  await enableFlag(db, {
    workspaceId: ws,
    key: 'p0_reports',
    staffUserId: pm,
    reason: 'design partner',
  });
  const { sql } = await import('drizzle-orm');
  await expect(db.execute(sql`update app.flag_change_log set reason = 'sửa'`)).rejects.toThrow();
  await expect(db.execute(sql`delete from app.flag_change_log`)).rejects.toThrow();
});

it('dependentsOf theo chuỗi phụ thuộc', () => {
  expect(dependentsOf('p0_reports')).toEqual(['p1_recommendations', 'p2a_approve', 'p2b_auto']);
  expect(dependentsOf('p2b_auto')).toEqual([]);
});

describe('ADR-0024: toàn app × gói + ngoại lệ', () => {
  it('mặc định toàn app tắt; ma trận gói theo bảng giá; bật toàn app → workspace có gói phù hợp mới dùng được', async () => {
    const { ws, pm, ctx } = await setup();
    const scopes = await readFlagScopes(db);
    expect(scopes.global).toEqual({
      p0_reports: false,
      p1_recommendations: false,
      p2a_approve: false,
      p2b_auto: false,
    });
    expect(scopes.plans.free).toMatchObject({ p0_reports: true, p1_recommendations: false });
    expect(scopes.plans.growth).toMatchObject({ p2a_approve: true, p2b_auto: true });
    // Bật cờ con khi cờ cha toàn app tắt → từ chối.
    await expect(
      setGlobalFlag(db, { key: 'p1_recommendations', enabled: true, staffUserId: pm, reason: 'mở toàn app' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    for (const key of ['p0_reports', 'p1_recommendations', 'p2a_approve', 'p2b_auto'] as const) {
      await setGlobalFlag(db, { key, enabled: true, staffUserId: pm, reason: 'mở toàn app' });
    }
    // Free: chỉ P0.
    expect(await getFlags(ctx)).toEqual({
      p0_reports: true,
      p1_recommendations: false,
      p2a_approve: false,
      p2b_auto: false,
    });
    // Growth: đủ.
    const { workspace: w2, owner } = await seedWorkspace(db);
    const ctx2 = { db, workspaceId: w2.id, actor: (await resolveActor(db, w2.id, owner.id))! };
    await setSubscription(ctx2, { planKey: 'growth' });
    expect(await getFlags(ctx2)).toEqual({
      p0_reports: true,
      p1_recommendations: true,
      p2a_approve: true,
      p2b_auto: true,
    });
    // Sửa ma trận: Free có P1.
    await setPlanFlag(db, {
      plan: 'free',
      key: 'p1_recommendations',
      enabled: true,
      staffUserId: pm,
      reason: 'khuyến mãi',
    });
    expect(await isEnabled(ctx, 'p1_recommendations')).toBe(true);
    // Tắt cờ cha toàn app → tắt luôn cờ con.
    expect(
      await setGlobalFlag(db, { key: 'p1_recommendations', enabled: false, staffUserId: pm, reason: 'sự cố gợi ý' }),
    ).toEqual(['p1_recommendations', 'p2a_approve', 'p2b_auto']);
    expect(await getFlags(ctx2)).toEqual({
      p0_reports: true,
      p1_recommendations: false,
      p2a_approve: false,
      p2b_auto: false,
    });
    const log = await flagScopeHistory(db);
    expect(log.map((l) => [l.scope, l.flagKey, l.newValue]).slice(0, 4)).toEqual([
      ['global', 'p2b_auto', false],
      ['global', 'p2a_approve', false],
      ['global', 'p1_recommendations', false],
      ['plan', 'p1_recommendations', true],
    ]);
    expect(ws).toBeTruthy();
  });

  it('ngoại lệ: bật thêm thắng gói, tắt riêng thắng toàn app; xóa ngoại lệ → về toàn app × gói; cờ cha vẫn bắt buộc', async () => {
    const { ws, pm, support, ctx } = await setup();
    await setGlobalFlag(db, { key: 'p0_reports', enabled: true, staffUserId: pm, reason: 'mở toàn app' });
    await setGlobalFlag(db, { key: 'p1_recommendations', enabled: true, staffUserId: pm, reason: 'mở toàn app' });
    // Free + bật thêm P1.
    await enableFlag(db, { workspaceId: ws, key: 'p1_recommendations', staffUserId: pm, reason: 'dùng thử P1' });
    expect(await getFlags(ctx)).toMatchObject({ p0_reports: true, p1_recommendations: true });
    // Tắt riêng P0 → P1 mất hiệu lực theo cờ cha.
    await disableFlag(db, { workspaceId: ws, key: 'p0_reports', staffUserId: support, reason: 'khách có sự cố' });
    expect(await getFlags(ctx)).toMatchObject({ p0_reports: false, p1_recommendations: false });
    await clearFlagOverride(db, { workspaceId: ws, key: 'p0_reports', staffUserId: support, reason: 'đã xử lý' });
    expect(await getFlags(ctx)).toMatchObject({ p0_reports: true });
    // Chỉ superadmin đổi được toàn app / gói.
    await expect(
      setGlobalFlag(db, { key: 'p0_reports', enabled: false, staffUserId: support, reason: 'thử tắt' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      setPlanFlag(db, { plan: 'free', key: 'p0_reports', enabled: false, staffUserId: support, reason: 'thử tắt' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
