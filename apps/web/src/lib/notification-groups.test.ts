import { describe, expect, it } from 'vitest';
import { notificationGroup } from './notification-groups';

describe('notificationGroup', () => {
  it('nhóm theo loại; loại lạ → hệ thống', () => {
    expect(notificationGroup('custom_alert')).toBe('alerts');
    expect(notificationGroup('anomaly')).toBe('alerts');
    expect(notificationGroup('action_executed')).toBe('actions');
    expect(notificationGroup('report_sent')).toBe('reports');
    expect(notificationGroup('token_expired')).toBe('system');
    expect(notificationGroup('sync_done')).toBe('system');
    expect(notificationGroup('loai_moi')).toBe('system');
  });
});
