import { describe, expect, it } from 'vitest';
import { summarizeSync } from './sync-progress';

describe('S06 tóm tắt tiến độ', () => {
  it('% theo ngày, đếm tài khoản xong', () => {
    const s = summarizeSync([
      { status: 'succeeded', daysDone: 90, daysTotal: 90, error: null },
      { status: 'running', daysDone: 42, daysTotal: 90, error: null },
    ]);
    expect(s).toMatchObject({
      percent: 73,
      accountsDone: 1,
      accountsTotal: 2,
      active: true,
      allDone: false,
      error: null,
    });
  });
  it('lỗi: ưu tiên token, rồi quyền, rồi lỗi tạm thời', () => {
    const f = (error: string) => ({ status: 'failed' as const, daysDone: 7, daysTotal: 90, error });
    expect(summarizeSync([f('META_RATE_LIMITED')]).error).toBe('TRANSIENT');
    expect(summarizeSync([f('META_RATE_LIMITED'), f('META_NO_ACCESS')]).error).toBe('META_NO_ACCESS');
    expect(summarizeSync([f('META_NO_ACCESS'), f('META_TOKEN_INVALID')]).error).toBe('META_TOKEN_INVALID');
  });
  it('rỗng → 0%, chưa xong', () => {
    expect(summarizeSync([])).toMatchObject({ percent: 0, allDone: false, active: false });
  });
});
