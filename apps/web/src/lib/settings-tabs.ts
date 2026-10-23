import type { FlagKey } from '@adxlens/core/flags';
import type { Role } from '@adxlens/core/shared';

export type SettingsTab = 'workspace' | 'members' | 'billing' | 'notifications' | 'profile' | 'guardrails';

/**
 * Thanh tab Cài đặt dùng chung (ux-requirements 6.7, Penpot ST01): Workspace · Thành viên · Gói &
 * thanh toán · Thông báo · Hồ sơ cá nhân; "Guardrails" chỉ hiện khi tính năng P2 bật (ẩn hẳn khi tắt).
 */
export function settingsTabs(role: Role, flags: Record<FlagKey, boolean>): SettingsTab[] {
  const tabs: SettingsTab[] = [];
  if (role === 'owner') tabs.push('workspace');
  if (role === 'owner' || role === 'manager') tabs.push('members');
  if (role === 'owner') tabs.push('billing');
  tabs.push('notifications', 'profile');
  if (role === 'owner' && flags.p2a_approve) tabs.push('guardrails');
  return tabs;
}
