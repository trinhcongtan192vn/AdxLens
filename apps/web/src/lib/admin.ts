// Hằng dùng chung cho trang admin (ADR-0013). Trang page không được xuất thêm symbol nên đặt ở lib.

/** Khóa i18n trung tính cho từng cờ (chuỗi giao diện không chứa tên cờ — CLAUDE.md quy tắc 7). */
export const FLAG_LABEL: Record<string, string> = {
  p0_reports: 'reports',
  p1_recommendations: 'recommendations',
  p2a_approve: 'approve',
  p2b_auto: 'auto',
};

/** Nhóm hành động trong nhật ký admin → khóa i18n `admin.audit.actions.*` (khóa lạ hiện nguyên văn). */
export function auditActionKey(action: string): string {
  return action.replace(/\./g, '_');
}
