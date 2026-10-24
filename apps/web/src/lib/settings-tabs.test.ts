import { describe, expect, it } from 'vitest';
import { settingsTabs } from './settings-tabs';

const off = { p0_reports: false, p1_recommendations: false, p2a_approve: false, p2b_auto: false };

describe('tab Cài đặt', () => {
  it('owner thấy đủ tab theo thứ tự Penpot; Guardrails ẩn khi tính năng P2 tắt', () => {
    expect(settingsTabs('owner', off)).toEqual(['workspace', 'members', 'billing', 'notifications', 'profile']);
    expect(settingsTabs('owner', { ...off, p2a_approve: true })).toContain('guardrails');
  });

  it('manager không thấy Workspace, Gói, Guardrails', () => {
    expect(settingsTabs('manager', { ...off, p2a_approve: true })).toEqual(['members', 'notifications', 'profile']);
  });

  it('buyer chỉ thấy Thông báo và Hồ sơ', () => {
    expect(settingsTabs('buyer', off)).toEqual(['notifications', 'profile']);
  });
});
