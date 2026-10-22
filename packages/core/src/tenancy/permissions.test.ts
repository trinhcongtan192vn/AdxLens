import { describe, expect, it } from 'vitest';
import type { Actor } from '@adxlens/core/shared';
import { can, canAccessClient, canApproveActions } from './permissions';

const actor = (role: Actor['role'], clientAccess: string[] = [], approve: string[] = []): Actor => ({
  userId: 'u',
  role,
  clientAccess,
  approveClientIds: approve,
});

describe('can', () => {
  it('chỉ owner quản lý thành viên, thanh toán, guardrails', () => {
    for (const p of ['members.manage', 'billing.manage', 'guardrails.manage'] as const) {
      expect(can('owner', p)).toBe(true);
      expect(can('manager', p)).toBe(false);
      expect(can('buyer', p)).toBe(false);
    }
  });

  it('buyer không tạo/chia sẻ báo cáo, không quản lý kết nối', () => {
    expect(can('buyer', 'reports.manage')).toBe(false);
    expect(can('buyer', 'connections.manage')).toBe(false);
    expect(can('buyer', 'findings.update')).toBe(true);
  });
});

describe('canAccessClient', () => {
  it('owner và manager không giới hạn thấy mọi Client', () => {
    expect(canAccessClient(actor('owner'), 'c1')).toBe(true);
    expect(canAccessClient(actor('manager'), 'c1')).toBe(true);
  });

  it('buyer không được gán Client nào thì không thấy Client nào', () => {
    expect(canAccessClient(actor('buyer'), 'c1')).toBe(false);
  });

  it('thành viên bị giới hạn chỉ thấy Client được gán', () => {
    expect(canAccessClient(actor('buyer', ['c1']), 'c1')).toBe(true);
    expect(canAccessClient(actor('buyer', ['c1']), 'c2')).toBe(false);
    expect(canAccessClient(actor('manager', ['c1']), 'c2')).toBe(false);
  });
});

describe('canApproveActions (Gate 1)', () => {
  it('buyer chỉ duyệt khi owner cấp theo Client', () => {
    expect(canApproveActions(actor('buyer', ['c1']), 'c1')).toBe(false);
    expect(canApproveActions(actor('buyer', ['c1'], ['c1']), 'c1')).toBe(true);
  });

  it('không duyệt được Client không có quyền truy cập dù được cấp duyệt', () => {
    expect(canApproveActions(actor('buyer', ['c2'], ['c1']), 'c1')).toBe(false);
  });

  it('owner và manager duyệt được mặc định', () => {
    expect(canApproveActions(actor('owner'), 'c1')).toBe(true);
    expect(canApproveActions(actor('manager'), 'c1')).toBe(true);
  });
});
