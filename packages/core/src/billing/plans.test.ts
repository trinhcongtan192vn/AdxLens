import { describe, expect, it } from 'vitest';
import { annualPriceVnd, DEFAULT_PLAN, GRACE_PERIOD_DAYS, hasEntitlement, PLANS } from './plans';

describe('cấu hình gói', () => {
  it('workspace mới ở gói Free, 1 tài khoản, có nhãn (ADR-0001 A5)', () => {
    expect(DEFAULT_PLAN).toBe('free');
    expect(PLANS.free.includedAccounts).toBe(1);
    expect(hasEntitlement('free', 'remove_badge')).toBe(false);
  });

  it('quyền ghi P2 từ Growth trở lên (ADR-0001 A6)', () => {
    expect(hasEntitlement('starter', 'write_actions')).toBe(false);
    expect(hasEntitlement('growth', 'write_actions')).toBe(true);
    expect(hasEntitlement('scale', 'write_actions')).toBe(true);
  });

  it('chỉ gói cao nhất gỡ nhãn', () => {
    expect(hasEntitlement('growth', 'remove_badge')).toBe(false);
    expect(hasEntitlement('scale', 'remove_badge')).toBe(true);
  });

  it('giá năm giảm 20%', () => {
    expect(annualPriceVnd('starter')).toBe(5_664_000);
  });

  it('ân hạn 7 ngày (ADR-0001 A8)', () => {
    expect(GRACE_PERIOD_DAYS).toBe(7);
  });

  it('giá và số tài khoản tăng dần theo gói', () => {
    const order = ['free', 'starter', 'growth', 'scale'] as const;
    for (let i = 1; i < order.length; i++) {
      expect(PLANS[order[i]!].monthlyPriceVnd).toBeGreaterThan(
        PLANS[order[i - 1]!].monthlyPriceVnd,
      );
      expect(PLANS[order[i]!].includedAccounts).toBeGreaterThan(
        PLANS[order[i - 1]!].includedAccounts,
      );
    }
  });
});
