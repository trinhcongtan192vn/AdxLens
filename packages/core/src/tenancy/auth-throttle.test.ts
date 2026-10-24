import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeTestDb, testDb, truncateAll } from '@adxlens/db/testing';
import { clearLoginFailures, loginThrottleState, recordLoginFailure } from './auth-throttle';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());

describe('khóa đăng nhập tạm thời', () => {
  it('5 lần sai thì khóa 15 phút, hết khóa thì đếm lại từ đầu', async () => {
    const t0 = new Date('2026-10-22T10:00:00Z');
    const at = (min: number) => ({ now: () => new Date(t0.getTime() + min * 60_000) });
    for (let i = 1; i <= 4; i++) {
      expect(await recordLoginFailure(db, 'A@B.vn', at(0))).toEqual({
        locked: false,
        remaining: 5 - i,
      });
    }
    expect(await recordLoginFailure(db, 'a@b.vn', at(0))).toEqual({
      locked: true,
      minutesLeft: 15,
    });
    expect(await loginThrottleState(db, 'a@b.vn', at(10))).toEqual({
      locked: true,
      minutesLeft: 5,
    });
    expect(await loginThrottleState(db, 'a@b.vn', at(16))).toEqual({ locked: false, remaining: 5 });
    expect(await recordLoginFailure(db, 'a@b.vn', at(16))).toEqual({ locked: false, remaining: 4 });
  });

  it('đăng nhập đúng xóa bộ đếm', async () => {
    await recordLoginFailure(db, 'a@b.vn');
    await clearLoginFailures(db, 'a@b.vn');
    expect(await loginThrottleState(db, 'a@b.vn')).toEqual({ locked: false, remaining: 5 });
  });

  it('không lưu email dạng rõ', async () => {
    await recordLoginFailure(db, 'secret-person@agency.vn');
    const rows = await db.execute(sql`select * from app.auth_throttle`);
    expect(JSON.stringify(rows)).not.toContain('secret-person');
  });
});
