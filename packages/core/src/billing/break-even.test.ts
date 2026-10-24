import { describe, expect, it } from 'vitest';
import { breakEven, PLANS, type PlanConfig, type PlanKey } from './index';

const plans = Object.fromEntries(
  Object.entries(PLANS).map(([k, p]) => [k, { ...p, monthlyPriceUsd: null, extraAccountVnd: 79_000 }]),
) as Record<PlanKey, PlanConfig>;

describe('công thức hoà vốn (M06)', () => {
  it('chọn gói rẻ nhất đủ tài khoản; giá trị = tài khoản × giờ × giá giờ', () => {
    const r = breakEven(plans, { accounts: 5, hoursPerAccount: 6, hourlyRateVnd: 150_000 });
    expect(r.plan).toBe('starter');
    expect(r.feeVnd).toBe(590_000n);
    expect(r.savedHours).toBe(30);
    expect(r.valueVnd).toBe(4_500_000n);
    expect(r.netVnd).toBe(3_910_000n);
    expect(r.breakEvenRateVnd).toBe(19_667n); // 590.000 / 30 giờ, làm tròn lên
  });

  it('6 tài khoản → Growth; vượt Scale → cộng phí tài khoản thêm', () => {
    expect(breakEven(plans, { accounts: 6, hoursPerAccount: 6, hourlyRateVnd: 1 }).plan).toBe('growth');
    const big = breakEven(plans, { accounts: 45, hoursPerAccount: 2.5, hourlyRateVnd: 100_000 });
    expect(big).toMatchObject({ plan: 'scale', extraAccounts: 5, feeVnd: 3_490_000n + 5n * 79_000n });
    expect(big.valueVnd).toBe(11_250_000n);
  });

  it('chưa hoà vốn thì lãi ròng âm; 0 giờ không chia cho 0', () => {
    expect(breakEven(plans, { accounts: 1, hoursPerAccount: 1, hourlyRateVnd: 100_000 }).netVnd).toBe(-490_000n);
    expect(breakEven(plans, { accounts: 1, hoursPerAccount: 0, hourlyRateVnd: 100_000 }).breakEvenRateVnd).toBe(0n);
  });
});
