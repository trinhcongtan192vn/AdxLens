import type { Rule } from '../types';

/**
 * Bộ quy tắc audit v1 (PRD 9.4). Mỗi quy tắc một file trong thư mục này (L3 8), thêm vào danh sách khi
 * có fixture và test "không đủ dữ liệu thì không phát hiện".
 */
export const RULES: Rule[] = [];
