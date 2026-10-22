import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeTestDb, seedStaff, seedWorkspace, testDb, truncateAll } from '@adxlens/db/testing';
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

  it('checklist chưa đạt thì chặn; vượt có lý do thì ghi override', async () => {
    const { ws, pm, ctx } = await setup();
    registerFlagCheck('p0_reports', {
      id: 'accounts_confirmed',
      label: 'Mọi tài khoản đã xác nhận gán',
      run: async () => ({ passed: false, detail: '1 tài khoản chưa xác nhận' }),
    });
    await expect(
      enableFlag(db, {
        workspaceId: ws,
        key: 'p0_reports',
        staffUserId: pm,
        reason: 'design partner',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(await isEnabled(ctx, 'p0_reports')).toBe(false);

    const r = await enableFlag(db, {
      workspaceId: ws,
      key: 'p0_reports',
      staffUserId: pm,
      reason: 'PM chấp nhận rủi ro, đã gọi khách',
      override: true,
    });
    expect(r.override).toBe(true);
    const [log] = await flagHistory(db, ws);
    expect(log?.override).toBe(true);
    expect(log?.checklistResult).toContainEqual(expect.objectContaining({ id: 'accounts_confirmed', passed: false }));
  });

  it('kiểm tra ném lỗi được coi là chưa đạt', async () => {
    const { ws, pm } = await setup();
    registerFlagCheck('p0_reports', {
      id: 'boom',
      label: 'Lỗi',
      run: async () => {
        throw new Error('db down');
      },
    });
    await expect(
      enableFlag(db, {
        workspaceId: ws,
        key: 'p0_reports',
        staffUserId: pm,
        reason: 'design partner',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
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
