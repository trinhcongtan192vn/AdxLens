import type { Rule } from '../types';
import { budgetMisallocation } from './budget-misallocation';
import { creativeFatigue } from './creative-fatigue';
import { fragmentation } from './fragmentation';
import { starvedWinner } from './starved-winner';

/**
 * Bộ quy tắc audit v1 (PRD 9.4). Mỗi quy tắc một file trong thư mục này (L3 8), thêm vào danh sách khi
 * có fixture và test "không đủ dữ liệu thì không phát hiện". Ngưỡng: `docs/rules/README.md`.
 */
export const RULES: Rule[] = [creativeFatigue, budgetMisallocation, starvedWinner, fragmentation];

export { budgetMisallocation, creativeFatigue, fragmentation, starvedWinner };
