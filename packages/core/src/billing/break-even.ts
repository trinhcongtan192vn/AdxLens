import { PAID_PLANS, type PaidPlan } from './stripe';
import type { PlanConfig } from './service';
import type { PlanKey } from './plans';

/** Mặc định của M06 (PRD 13.3): giờ tiết kiệm mỗi tài khoản mỗi tháng, giá giờ nội bộ (VND). */
export const BREAK_EVEN_DEFAULTS = { accounts: 5, hoursPerAccount: 6, hourlyRateVnd: 150_000 } as const;

export type BreakEvenResult = {
  plan: PaidPlan;
  /** Tài khoản vượt hạn mức của gói lớn nhất (tính theo giá tài khoản thêm). */
  extraAccounts: number;
  feeVnd: bigint;
  savedHours: number;
  valueVnd: bigint;
  netVnd: bigint;
  /** Giá giờ tối thiểu để hoà vốn (VND, làm tròn lên). */
  breakEvenRateVnd: bigint;
};

/**
 * Công thức hoà vốn công khai (M06, PRD 13.3): giá trị = tài khoản × giờ tiết kiệm × giá giờ, so với phí
 * gói rẻ nhất đủ số tài khoản (vượt gói lớn nhất thì cộng phí tài khoản thêm). Tiền tính bằng BigInt.
 */
export function breakEven(
  plans: Record<PlanKey, PlanConfig>,
  input: { accounts: number; hoursPerAccount: number; hourlyRateVnd: number },
): BreakEvenResult {
  const accounts = Math.max(1, Math.floor(input.accounts));
  const plan = PAID_PLANS.find((k) => plans[k].includedAccounts >= accounts) ?? 'scale';
  const extraAccounts = Math.max(0, accounts - plans[plan].includedAccounts);
  const feeVnd = BigInt(plans[plan].monthlyPriceVnd) + BigInt(extraAccounts) * BigInt(plans[plan].extraAccountVnd);
  // Giờ giữ 1 chữ số thập phân: nhân 10 để tính nguyên.
  const tenthHours = BigInt(accounts) * BigInt(Math.round(input.hoursPerAccount * 10));
  const valueVnd = (tenthHours * BigInt(Math.round(input.hourlyRateVnd))) / 10n;
  const breakEvenRateVnd = tenthHours === 0n ? 0n : (feeVnd * 10n + tenthHours - 1n) / tenthHours;
  return {
    plan,
    extraAccounts,
    feeVnd,
    savedHours: Number(tenthHours) / 10,
    valueVnd,
    netVnd: valueVnd - feeVnd,
    breakEvenRateVnd,
  };
}
