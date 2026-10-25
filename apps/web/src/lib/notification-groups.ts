/** Nhóm loại thông báo cho bộ lọc hộp thư (PM 25/10: gộp Thông báo + Cảnh báo thành một màn). Hàm thuần. */
export const NOTIFICATION_GROUPS = ['alerts', 'actions', 'reports', 'system'] as const;
export type NotificationGroup = (typeof NOTIFICATION_GROUPS)[number];

const GROUP: Record<string, NotificationGroup> = {
  custom_alert: 'alerts',
  anomaly: 'alerts',
  budget_pacing: 'alerts',
  reconciliation_warning: 'alerts',
  action_failed: 'actions',
  action_assigned: 'actions',
  action_executed: 'actions',
  rule_suggest_resume: 'actions',
  weekly_actions: 'actions',
  report_viewed: 'reports',
  report_sent: 'reports',
  report_postponed: 'reports',
  report_needs_approval: 'reports',
  weekly_digest: 'reports',
};

/** Loại lạ (thêm sau) → "Hệ thống" để vẫn hiện trong "Tất cả". */
export function notificationGroup(kind: string): NotificationGroup {
  return GROUP[kind] ?? 'system';
}
