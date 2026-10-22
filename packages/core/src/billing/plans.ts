/**
 * CẤU HÌNH GÓI — PM chỉnh trực tiếp file này, không cần sửa code nơi khác.
 * Giá tạm theo ux-requirements 9.1 (chờ chốt sau thử nghiệm giá E3, PRD 13.3). Giá VND/tháng, chưa
 * gồm VAT. Tính theo tài khoản QC hoạt động (có chi tiêu trong 30 ngày), không theo % ngân sách.
 */
export const PLAN_KEYS = ['free', 'starter', 'growth', 'scale'] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

export type Entitlement =
  | 'reports' // báo cáo, link công khai, PDF
  | 'remove_badge' // gỡ nhãn "Powered by AdxLens"
  | 'white_label'
  | 'recommendations' // P1: gợi ý hằng tuần, creative library
  | 'detailed_reconciliation'
  | 'write_actions' // P2a: hành động có duyệt (ADR-0001 A6: Growth trở lên)
  | 'automation' // P2b: rule tự động
  | 'priority_support';

export type Plan = {
  key: PlanKey;
  /** VND/tháng, thanh toán theo tháng. Số nguyên đồng. */
  monthlyPriceVnd: number;
  includedAccounts: number;
  entitlements: Entitlement[];
};

export const PLANS: Record<PlanKey, Plan> = {
  free: { key: 'free', monthlyPriceVnd: 0, includedAccounts: 1, entitlements: ['reports'] },
  starter: {
    key: 'starter',
    monthlyPriceVnd: 590_000,
    includedAccounts: 5,
    entitlements: ['reports', 'recommendations', 'detailed_reconciliation'],
  },
  growth: {
    key: 'growth',
    monthlyPriceVnd: 1_490_000,
    includedAccounts: 15,
    entitlements: [
      'reports',
      'recommendations',
      'detailed_reconciliation',
      'write_actions',
      'automation',
    ],
  },
  scale: {
    key: 'scale',
    monthlyPriceVnd: 3_490_000,
    includedAccounts: 40,
    entitlements: [
      'reports',
      'recommendations',
      'detailed_reconciliation',
      'write_actions',
      'automation',
      'remove_badge',
      'white_label',
      'priority_support',
    ],
  },
};

/** Tài khoản thêm ngoài gói, VND/tháng. */
export const EXTRA_ACCOUNT_MONTHLY_VND = 79_000;
/** Trả theo năm giảm 20%. */
export const ANNUAL_DISCOUNT = 0.2;
/** ADR-0001 A8: ân hạn khi past_due hoặc vượt hạn mức. */
export const GRACE_PERIOD_DAYS = 7;
/** ADR-0001 A5: workspace mới ở gói Free. */
export const DEFAULT_PLAN: PlanKey = 'free';

export function hasEntitlement(plan: PlanKey, e: Entitlement): boolean {
  return PLANS[plan].entitlements.includes(e);
}

/** Giá năm (VND) = 12 tháng × (1 − giảm giá), làm tròn tới nghìn đồng. */
export function annualPriceVnd(plan: PlanKey): number {
  return Math.round((PLANS[plan].monthlyPriceVnd * 12 * (1 - ANNUAL_DISCOUNT)) / 1000) * 1000;
}
