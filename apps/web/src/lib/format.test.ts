import { describe, expect, it } from 'vitest';
import { maskAccountId, tokenState } from './format';

describe('định dạng S02', () => {
  it('rút gọn ID tài khoản', () => {
    expect(maskAccountId('act_120345678988')).toBe('act_1203…88');
    expect(maskAccountId('act_1')).toBe('act_1');
  });

  it('trạng thái token', () => {
    const now = new Date('2026-10-23T00:00:00Z');
    expect(tokenState('expired', null, now)).toEqual({ kind: 'expired' });
    expect(tokenState('active', '2026-10-22T00:00:00Z', now)).toEqual({ kind: 'expired' });
    expect(tokenState('active', '2026-10-29T00:00:00Z', now)).toEqual({ kind: 'expiring', days: 6 });
    expect(tokenState('active', '2026-12-29T00:00:00Z', now)).toEqual({ kind: 'valid' });
    expect(tokenState('active', null, now)).toEqual({ kind: 'valid' });
  });
});
