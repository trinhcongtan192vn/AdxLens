import type { Rule } from '../types';
import { accountHygiene } from './account-hygiene';
import { budgetMisallocation } from './budget-misallocation';
import { conversionTracking } from './conversion-tracking';
import { creativeFatigue } from './creative-fatigue';
import { fragmentation } from './fragmentation';
import { learningLimited } from './learning-limited';
import { spendNoConversion } from './spend-no-conversion';
import { starvedWinner } from './starved-winner';

/**
 * Bộ quy tắc audit v1 (PRD 9.4). Mỗi quy tắc một file trong thư mục này (L3 8), thêm vào danh sách khi
 * có fixture và test "không đủ dữ liệu thì không phát hiện". Ngưỡng: `docs/rules/README.md`.
 */
export const RULES: Rule[] = [
  creativeFatigue,
  budgetMisallocation,
  starvedWinner,
  fragmentation,
  learningLimited,
  spendNoConversion,
  accountHygiene,
  conversionTracking,
];

export {
  accountHygiene,
  budgetMisallocation,
  conversionTracking,
  creativeFatigue,
  fragmentation,
  learningLimited,
  spendNoConversion,
  starvedWinner,
};
